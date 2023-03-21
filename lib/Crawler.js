const fs = require('fs-extra')
const sanitize = require('sanitize-filename')
const path = require('path')
// const json2md = require('json2md')

const imgs2pdf = require('./helpers/imgs2pdf.js');
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())


const cheerio = require('cheerio')
const { differenceBy } = require("lodash")
const { NodeHtmlMarkdown } = require('node-html-markdown')
const { createLogger, isCompletelyDownloaded } = require("./helpers/fileChecker");
const findChrome = require('chrome-finder')

const req = require('requestretry')
// const __ = require("lodash/fp/__");
const j = req.jar()
const request = req.defaults({
    jar         : j,
    retryDelay  : 500,
    fullResponse: true,
    headers     : {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.125 Safari/537.36'
        // 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.119 Safari/537.36',

    }
})

module.exports = class Crawler {

    static async getCourses(searchFromLocalFile) {
        if (searchFromLocalFile && await fs.exists(path.resolve(__dirname, '../json/search-courses.json'))) {
            console.log('LOAD FROM LOCAL SEARCH FILE');
            const courses = require(path.resolve(path.resolve(__dirname, '../json/search-courses.json')))
            return courses.map(c => ({
                ...c,
                value: c.url,
            }))
        }
        return Promise
            .resolve()
            .then(async () => {
                let { body } = await request(`https://www.educative.io/api/reader/featured_items?only_courses=true&featured=true`)
                body = JSON.parse(body)
                // console.log('body', body.works.length, typeof body.works);
                const courses = body
                    ?.works
                    .map((elem) => {

                        // console.log('title:', elem?.title)
                        // console.log('slug:', `https://www.educative.io/${elem?.course_url_slug ? "courses/" + elem.course_url_slug : "collection/" + elem.author_id + "/" + elem.id}`);
                        const link = `https://www.educative.io/${elem?.course_url_slug ? "courses/" + elem.course_url_slug : "collection/" + elem.author_id + "/" + elem.id}`
                        return {
                            title: elem?.title,
                            value: link,
                            url: link
                        }
                    })

                await fs.writeFile(path.resolve(__dirname, '../json/search-courses.json'), JSON.stringify(courses, null, 2), 'utf8')
                return courses;
            })
    }

    /**
     *
     * @param time
     * @returns {Promise<unknown>}
     */
    delay(time) {
        return new Promise(function (resolve) {
            setTimeout(resolve, time)
        })
    }

    /**
     *
     * @param fn
     * @param opts
     * @returns {Promise<*>}
     */
    async withBrowser(fn, opts) {
        const browser = await puppeteer.launch({
            headless         : opts.headless === 'yes' ? true : false, //run false for dev memo
            Ignorehttpserrors: true, // ignore certificate error
            waitUntil        : 'networkidle2',
            defaultViewport  : {
                width : 1920,
                height: 1080
            },
            timeout          : 60e3,
            args             : [
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '-- Disable XSS auditor', // close XSS auditor
                '--no-zygote',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '-- allow running secure content', // allow unsafe content
                '--disable-webgl',
                '--disable-popup-blocking',
                //'--proxy-server= http://127.0.0.1:8080 '// configure agent
            ],
            executablePath   : findChrome(),
        })
        try {
            return await fn(browser)
        } finally {
            await browser.close()
        }
    }

    /**
     *
     * @param browser
     * @returns {(function(*): Promise<*|undefined>)|*}
     */
    withPage(browser) {
        return async fn => {
            const page = await browser.newPage()
            try {
                return await fn(page)
            } finally {
                await page.close()
            }
        }
    }

    /**
     *
     * @param page
     * @param opts
     * @returns {Promise<void>}
     */
    async loginAndRedirect(page, opts) {
        const login = 'https://www.educative.io/login'
        await page.goto(login, { waitUntil: 'networkidle0' })

        await page.waitForSelector('input[name="email"]')
        await page.focus('input[name="email"]')
        await page.keyboard.type(opts.email)
        await page.focus('input[name="password"]')
        await page.keyboard.type(opts.password)
        await page.click('button[type="submit"]')

        // await page.waitForTimeout(4e3)

        await page.waitForSelector('h3[name="selenium-welcome-back-text"]', {
            timeout: 33e3
        })
        // const a = Array.from(document.body.querySelectorAll('h3[name="selenium-welcome-back-text"]'), txt => txt.textContent)[0]
        let a = await page.evaluate(() => Array.from(document.body.querySelectorAll('h3[name="selenium-welcome-back-text"]'), txt => txt.textContent)[0]);
        // let url = await page.url();
        const browserPage = await page.evaluate(() => location.href)

        //check if we are on profile page
        if (!browserPage.includes('/learn')) {
            throw new Error('Wrong page!!!')
        }

    }

    /**
     *
     * @param page
     * @param link
     * @param url
     * @returns {Promise<*>}
     */
    async getCourseForDownload(page, link, { all }) {
        //this is student available API endpoint
        //https://www.educative.io/api/reader/github-student-pack

        //let's check if we can find this course in our courses
        if (!all && await fs.exists(path.resolve(__dirname, '../json/search-courses.json'))) {
            console.log('LOAD COURSE FROM LOCAL FILE');
            const c = require(path.resolve(__dirname, '../json/search-courses.json'))
            const foundCourse = c.find(({ url }) => link.includes(url))
            if (foundCourse) {
                console.log('course is founded:', foundCourse.url);
                return [foundCourse]
            }
        }
        //let links = require(path.resolve(__dirname, '../json/search-courses.json')));
        await this.clickOnShowMoreButtonForCourses(page);
        let links = await page.evaluate(() => {
            return Array.from(
                document.body.querySelectorAll(
                    '.overflow-x-hidden.no-scrollbar > div a'
                ), a => {
                    return ({
                        url  : a.href,
                        title: a.querySelector('p').innerText
                            .replaceAll('\\W+', '')
                            .replace('\\nStart\\n', '')
                            .replace(/(\r\n|\n|\r)/gm, '')
                            .replace(/[/\\?%*:|"<>]/g, '')
                            .trim()
                    })
                })
        })
        console.log('Total number of courses found:', links.length);//, links
        //remove courses that are downloaded already
        if (await fs.exists(path.resolve(__dirname, '../json/search-courses.json'))) {
            const downloadedCourses = await require(path.resolve(__dirname, '../json/search-courses.json'))
            links = differenceBy(links, downloadedCourses, 'url')
            //console.log('Remaining courses to be downloaded:', links.length);
        }

        return all ? links : [links.find(({ url }) => link.includes(url))]//series.find(link => url.includes(link.url))
    }

    /**
     *
     * @param course
     * @param ms
     * @param index
     * @param total
     * @returns {bluebird<{series: string, downPath: string, position: number | string, title: string, url: string}>}
     */
    extractVideos({
        course,
        ms,
        index,
        total
    }) {
        let series = sanitize(course.series.title)
        let position = course.index + 1
        let title = sanitize(`${String(position).padStart(2, '0')}-${course.title}.mp4`)
        // let downPath = `${course.series.id}-${series}`
        let downPath = series
        // ms.update('info', { text: `Extracting: ${index}/${total} series ${series} - episode ${title}` });

        return {
            series,
            title,
            position,
            downPath,
            url     : course?.url,
            markdown: course?.markdown
        }
    }


    /**
     *
     * @param opts
     * @param url
     * @returns {Promise<*>}
     */
    async scrapeCourses(opts, url) {
        const { ms, all, overwrite } = opts

        return await this.withBrowser(async (browser) => {
            return await this.withPage(browser)(async (page) => {

                await this.loginAndRedirect(page, opts)

                const courses = await this.getCourseForDownload(page, url, opts)
                console.log('Number of courses to be downloaded:', courses.length);//, courses
                if (!courses?.length) {
                    console.log('No courses found, check if it already downloaded!!!!');
                    return [];
                }

                /*const courses = [
                    {
                        "url"  : "https://www.educative.io/courses/intermediate-javascript",
                        "title": "Intermediate JavaScript Building Frontend Components"
                    },
                ]*/

                const lessons = await Promise
                    .mapSeries(courses, async course => {
                        let lessons = await this.getLessons(browser, page, course, ms, opts);
                        /*let lessons = [
                            {
                                url  : 'https://www.educative.io/courses/kotlin-crash-course-for-programmers/N7mnYr48KNv',
                                title: 'Exception Handling in Kotlin'
                            },
                        ];*/
                        // const lessonsLength = lessons.length
                        ms.add('info', { text: `Get course: ${course.title} with lessons: ${lessons.length}` });
                        // console.log('length:', lessons.length);//'1lessons', lessons,

                        // ms.update('info', { text: `Checking ${course.url} for ${lessons.length} lessons` })
                        return await Promise
                            .map(lessons, async (lesson, index) => {
                                return await this.withPage(browser)(async (page) => {
                                    // console.log(`scraping: ${index} - ${lesson.url} - ${lesson.title}`);
                                    ms.update('info', { text: `scraping: ${index + 1}/${lessons.length} - ${lesson.url} - ${lesson.title}` })

                                    /*await this.retry(async () => {
                                        //ensure that we are on the page
                                        await page.goto(lesson.url, { waitUntil: 'networkidle0' })
                                        await page.waitForSelector('h1')

                                    }, 6, 1e3, true);*/

                                    try {
                                        // check if 'popup' is visible

                                        await page.click(`#ModalOverlay`, {
                                            visible: true,
                                        })
                                        console.log('Modal found');
                                    } catch (e) {
                                        // console.log('no Modal found');
                                    }

                                    if (this.fileIsDownloaded(course, opts, index, lesson) && overwrite === 'no') {
                                        // console.log('file is download already', lesson.title);
                                        console.log(`scraping already downloaded: ${index + 1} - ${lesson.url} - ${lesson.title}`);
                                        await page.waitForTimeout(1e3)
                                    } else {
                                        await this.scrape(browser, page, course, index, lesson, opts);
                                        // await this.makeScreenshot(page, course, index, lesson.title, opts)
                                        //await this.createMarkdownFromHtml(page, course, index, lesson, opts);
                                        this.addPageAsDownloaded(course, opts, index, lesson);
                                    }

                                    return this.extractVideos({
                                        course: {
                                            index,
                                            ...lesson,
                                            // vimeoUrl,
                                            series: { ...course }
                                        },
                                        index,
                                        total : lessons.length
                                    })
                                })
                            }, { concurrency: 3 })
                            .then(async items => {
                                ms.succeed('info', { text: `---- ${course.url} has ${items.length} lessons for download` })
                                await Promise.all([
                                    (async () => {
                                        //check what is scraped from pages
                                        await fs.ensureDir(path.resolve(__dirname, '../json'))
                                        await fs.writeFile(path.resolve(__dirname, `../json/test-$\{new Date().toISOString()}.json`), JSON.stringify(items, null, 2), 'utf8')
                                    })(),
                                    (async () => {
                                        await imgs2pdf(
                                            path.join(opts.dir, sanitize(course.title)),
                                            path.join(opts.dir, sanitize(course.title), `${course.title}.pdf`))
                                    })(),
                                    (async () => {
                                        if (await fs.exists(path.resolve(__dirname, '../json/search-courses.json'))) {
                                            console.log('add course as downloaded', course);
                                            const downloadedCourses = require(path.resolve(__dirname, '../json/search-courses.json'))
                                            const foundCourse = downloadedCourses.find(({ url }) => course.url.includes(url))
                                            if (!foundCourse) {
                                                console.log('-->adding coure:', foundCourse);
                                                downloadedCourses.push(course);
                                                await fs.writeFile(`./json/downloaded-courses.json`, JSON.stringify(downloadedCourses, null, 2), 'utf8')
                                            }
                                        }
                                    })(),
                                ])

                                return items;
                            })
                    })

                // ms.succeed('info', { text: `Found: ${lessons.length} lessons` })
                await fs.ensureDir(path.resolve(__dirname, '../json'))
                await fs.writeFile(path.resolve(__dirname, `../json/test.json`), JSON.stringify(lessons, null, 2), 'utf8')

                return lessons
            })
        }, opts)
    }

    async scrape(browser, page, course, index, lesson, opts) {
        const { ms } = opts
        await this.retry(async () => {
            try {
                //ensure that we are on the page
                await page.goto(lesson.url, { waitUntil: 'networkidle0' })
                await page.waitForSelector('h1')

                page.on('dialog', async dialog => {
                    console.log('----here dialog');
                    await dialog.accept();
                });

                page.on('dialog', async dialog => {
                    console.log('dismis', dialog.message());
                    await dialog.dismiss();
                });
                await page.waitForSelector("span[class*='markdownViewerQuiz']", {
                    timeout: 10e3
                })
                ms.update('info', { text: `it is quiz page: ${index + 1} - ${lesson.url} - ${lesson.title}` })

                //go to quiz page
                await page.waitForSelector('.question-option-view', {
                    timeout: 10e3
                })

            } catch {
                ms.update('info', { text: `it is NOT quiz page: ${index + 1} - ${lesson.url} - ${lesson.title}` })
                const result1 = await Promise.all([
                    (async () => {
                        // check is 'solution tab' visible
                        try {

                            await page.waitForSelector(".desktop-only button")
                            await page.waitForSelector(".code-container")
                            await page.waitForSelector("#tab-title-selenium")

                            //todo: check if there is better way to click on multiple buttons
                            await page.$$eval('.desktop-only:last-child button', elHandles => elHandles.forEach(el => el.click()))
                            await page.waitForTimeout(2e3)
                            await page.$$eval('.desktop-only:last-child button', elHandles => elHandles.forEach(el => el.click()))
                            await page.waitForTimeout(2e3)

                            return 'Solution tab';
                        } catch (e) {
                            return false;
                        }

                    })(),
                    (async () => {
                        // check is 'code tree' visible
                        try {
                            await page.waitForSelector(".code-tabs-code-wrapper")
                            await page.waitForSelector("div[class*='styles__CodeTabs_FileTree']")
                            await page.waitForSelector("[id*='react-tabs'] div > svg:nth-child(2)")

                            let series = sanitize(course.title)
                            // let position = index + 1

                            const dest = path.join(opts.dir, series, 'code', `${String(index + 1).padStart(2, '0')}-${lesson.title}`)
                            fs.ensureDir(dest)
                            //download file
                            const client = await page.target().createCDPSession();

                            //
                            //const downloadPDFButton = await page.$("#react-tabs-1 > div > span > div > div > svg:nth-child(2)");
                            //await downloadPDFButton.click();
                            // await page.$$eval("[id*='react-tabs'] div > svg:nth-child(2)", elHandles => elHandles.forEach(el => el.click()))

                            const elHandleArray = await page.$$("[id*='react-tabs'] div > svg:nth-child(2)")
                            // console.log('found downloads:', elHandleArray.length, lesson.title);
                            await Promise
                                .mapSeries(elHandleArray, async (el, key) => {
                                    await client.send('Page.setDownloadBehavior', {
                                        behavior    : 'allow',
                                        downloadPath: path.join(dest, String(key)),
                                    });

                                    // console.log('dowloading:', key, lesson.title);
                                    await el.click()
                                    await page.waitForTimeout(2e3)
                                })

                            return 'code tree';
                        } catch (e) {
                            return false;
                        }
                    })(),
                    (async () => {
                        try {
                            // check if 'slides' is visible
                            await page.waitForSelector("svg[aria-label*='view all slides']")
                            await this.delay(1e3)
                            await page.click("svg[aria-label*='view all slides']", {
                                visible: true,
                            })

                            return 'Slides found';
                        } catch (e) {
                            return false;
                        }
                    })(),
                    (async () => {
                        // check is 'need hint?' visible
                        try {
                            await page.waitForSelector("button[aria-label*='Show Hint']")
                            let text = await page.evaluate(
                                () => Array.from(document.body.querySelectorAll("button[aria-label*='Show Hint']"), txt => txt.textContent)[0]
                            );

                            await page.click("button[aria-label*='Show Hint']", {
                                visible: true,
                            })
                            await this.delay(1e3)

                            return text;
                        } catch (e) {
                            return false;
                        }

                    })(),
                    (async () => {
                        // check is 'show solution' visible
                        try {
                            // console.log('show solution 1');
                            await page.waitForSelector("button[aria-label*='olution']")
                            // await page.waitForNavigation({ waitUntil: 'networkidle0' });
                            let text = await page.evaluate(
                                () => Array.from(document.body.querySelectorAll("button[aria-label*='olution']"), txt => txt.textContent)[0]
                            );
                            if (text === 'Hide Solution') {
                                return;
                            }
                            await page.click(`button[aria-label*='olution']`, {
                                visible: true,
                            })
                            await this.delay(1e3)

                            //just show solution button
                            await page.click(`button[aria-label*='confirm']`, {
                                visible: true,
                            })
                            await this.delay(1e3)
                            await page.waitForSelector(".runnable-enter-done")

                            return text + ' 1st';
                        } catch (e) {
                            return false;
                        }

                    })(),
                    (async () => {
                        //check if "show solution" is visible
                        try {
                            await page.waitForSelector("button[arialabel*='olution']")
                            let text = await page.evaluate(
                                () => Array.from(document.body.querySelectorAll("button[arialabel*='olution']"), txt => txt.textContent)[0]
                            );
                            if (text === 'Hide Solution') {
                                return;
                            }
                            await page.waitForTimeout(1e3)
                            const showSolution = await page.$("button[arialabel*='olution']");
                            await showSolution.focus();
                            await showSolution.click();
                            await page.waitForTimeout(1e3)
                            //just show solution button
                            await page.waitForSelector("button[aria-label*='confirm']", {
                                timeout: 10e3
                            })
                            await page.click(`button[aria-label*='confirm']`)
                            // await page.waitForTimeout(1e3)
                            await page.waitForSelector(".runnable-enter-done")
                            return text + ' 2nd';
                        } catch (e) {
                            return false;
                        }
                    })(),

                ])
                // console.log('result1', result1, lesson.title);
                await this.makeScreenshot(browser, page, course, index, lesson.title, opts)
                ms.update('info', { text: `done: ${index + 1} - ${lesson.url} - ${lesson.title}` })
                return;
            }

            //go to quiz page
            /*await page.waitForSelector('.question-option-view', {
                timeout: 59e3
            })*/

            await this.solveQuiz(browser, page, course, index, lesson, opts, 1);

        }, 6, 1e3, page, true,);
    }


    async solveQuiz(browser, page, course, index, lesson, opts, counter) {
        try {

            await page.waitForSelector(`.quiz-view-mode`, {
                visible: true,
                timeout: 8e3
            })

            const elHandleArray = await page.$$("div[class*='ArticlePage'] .block .quiz-view-mode")//
            await Promise
                .mapSeries(elHandleArray, async (el, key) => {
                    const firstRadioButton = await el.$('.question-option-view:nth-child(1)')
                    const checked = await (await firstRadioButton.getProperty('className')).jsonValue()
                    // console.log('className: ', checked);
                    if (!checked.includes('question-option-view-selected')) {
                        //click on first option
                        // await firstRadioButton.focus()
                        await firstRadioButton.click()
                        await page.waitForTimeout(2e3)

                        //find submit button
                        const submitAnswerButton = await el.$('div[class*="styles__SlideControl"] > div:last-child button:last-child')
                        // await submitAnswerButton.focus()
                        await submitAnswerButton.click()
                        await page.waitForTimeout(2e3)

                        //find answers button
                        const checkAnswersButton = await el.$('div[class*="styles__SlideControl"] > div:last-child button:last-child')
                        // await checkAnswersButton.focus()
                        await checkAnswersButton.click()
                        await page.waitForTimeout(2e3)
                    }

                })

            let title = `${String(counter).padStart(2, '0')}-${lesson.title}`
            await this.makeScreenshot(browser, page, course, index, title, opts)
            await this.delay(1e3)

            //next button
            await page.click("button[class*='styles__SlideRightButton']", {
                visible: true,
            })

            await this.delay(1e3)
            return await this.solveQuiz(browser, page, course, index, lesson, opts, ++counter);
        } catch (error) {
            let title = `${String(counter).padStart(2, '0')}-${lesson.title}`
            await this.makeScreenshot(browser, page, course, index, title, opts)
            await this.delay(1e3)
            return;
        }
    }

    async getLessons(browser, page, course, ms, opts) {

        // ms.update('info', { text: `Checking ${course.url} for ${lessons.flat().length} lessons` })
        await page.goto(`${course.url}`, { timeout: 29e3 }) // waitUntil: 'networkidle0',
        await page.waitForSelector('h1.heading-one', { timeout: 22e3 })

        let series = sanitize(course.title)
        // let title = sanitize(`${String(0).padStart(2, '0')}-${course.title}.html`)
        const dest = path.join(opts.dir, series)
        console.log('destination folder for download:', dest);
        // method #2
        /*await page.evaluate(() => {
            [...document.querySelectorAll('button')].find(element => element.textContent === '+ Add Dropoff Notes').click();
        });*/
        await page.click('h3 + button');
        await this.delay(1e3)
        await page.click('h3 + button');
        await this.delay(1e3)
        // https://www.educative.io/collection/page/10370001/5637225408626688/5074275455205376
        await this.makeScreenshot(browser, page, { title: course.title }, -1, course.title, opts)
        // await this.createHtmlPage(page, dest, 0, title);
        // await this.createPdf(page, dest, position, lesson);
        // await this.createFullPageScreenshot(page, dest, 0, title);

        /*await page.waitForSelector('#__NEXT_DATA__', {
            timeout: 5e3
        })
        const a = await page.$('#__NEXT_DATA__')
        console.log('inner', a.innerText);
        const iframeData = await page.evaluate(() => JSON.parse(Array.from(document.body.querySelectorAll('#__NEXT_DATA__'), txt => txt.text)[0]))
        console.log('iframeData', iframeData);*/

        let lessons = await page.evaluate(() => {
            // const series = Array.from(document.body.querySelectorAll('h1.elementor-heading-title'), txt => txt.textContent)[0]
            const links = Array.from(document.body.querySelectorAll('menu a'), a => {
                return ({
                    url  : a.href,
                    title: a.innerText
                        .replaceAll('\\W+', '')
                        .replace('\\nStart\\n', '')
                        .replace(/(\r\n|\n|\r)/gm, '')
                        .replace(/[/\\?%*:|"<>]/g, '')
                        .trim()
                })
            })
            return links
        })

        if (!lessons.length) {
            lessons = await page.evaluate(() => {
                const links = Array.from(document.body.querySelectorAll(".flex.flex-col.w-full a.cursor-pointer"), a => {//h2 .flex.flex-col.w-full a
                    return ({
                        url  : a.href,
                        title: a.innerText
                            .replaceAll('\\W+', '')
                            .replace('\\nStart\\n', '')
                            .replace(/(\r\n|\n|\r)/gm, '')
                            .replace(/[/\\?%*:|"<>]/g, '')
                            .trim()
                    })
                })
                return links
            })
        }

        return lessons
    }

    /**
     *
     * @param browser
     * @param page
     * @param course
     * @param index
     * @param title
     * @param opts
     * @returns {Promise<void>}
     */
    async makeScreenshot(browser, page, course, index, title, opts) {
        //create a screenshot
        const $sec = await page.$('body')
        if (!$sec) throw new Error(`Parsing failed!`)
        await this.delay(1e3) //5e3

        let series = sanitize(course.title)
        let position = index + 1

        const dest = path.join(opts.dir, series)
        fs.ensureDir(dest)
        await $sec.screenshot({
            path          : path.join(dest, sanitize(`${String(position).padStart(2, '0')}-${title}.png`)),
            type          : 'png',
            omitBackground: true,
            delay         : '500ms'
        })

        await this.delay(1e3)

        await this.createHtmlPage(page, dest, position, title);
        await this.createMarkdownFromHtml(page, course, index, title, opts);
        await this.createPdf(browser, page, dest, position, title);
        // await this.createFullPageScreenshot(page, dest, position, title);
        await this.delay(1e3)
    }

    async writeVideosIntoFile(file, logger, prefix, courses, filename) {
        if (!file) {
            await fs.writeFile(`./json/${filename}`, JSON.stringify(courses, null, 2), 'utf8')
            logger.info(`json file created with lessons ...`)
        }
        logger.succeed(`Downloaded all videos for '${prefix}' api! (total: ${courses.length})`)
        //return courses
    }

    /**
     * Retries the given function until it succeeds given a number of retries and an interval between them. They are set
     * by default to retry 5 times with 1sec in between. There's also a flag to make the cooldown time exponential
     * @param {Function} fn - Returns a promise
     * @param {Number} retriesLeft - Number of retries. If -1 will keep retrying
     * @param {Number} interval - Millis between retries. If exponential set to true will be doubled each retry
     * @param page
     * @param {Boolean} exponential - Flag for exponential back-off mode
     * @return {Promise<*>}
     */
    async retry(fn, retriesLeft = 5, interval = 1000, page, exponential = false) {
        try {
            const val = await fn()
            return val
        } catch (error) {
            if (retriesLeft) {
                console.log('.... retrying left (' + retriesLeft + ')')
                console.log('retrying err', error)
                await fs.ensureDir(path.resolve(__dirname, '../errors'))
                await page.screenshot({
                    path: path.resolve(__dirname, `../errors/${new Date().toISOString()}.png`),
                    // path    : path.join(process., sanitize(`${String(position).padStart(2, '0')}-${title}-full.png`)),
                    fullPage: true
                });
                await new Promise(r => setTimeout(r, interval))
                return this.retry(fn, retriesLeft - 1, exponential ? interval*2 : interval, page, exponential)
            } else {
                console.log('Max retries reached')
                throw error
            }
        }
    }

    async createPdf(browser, page, dest, position, title) {
        if (!await this.isHeadlessMode(browser)) {
            console.log('headless mode is set off!!!')
            return
        }
        await fs.ensureDir(path.join(dest, 'pdf'))
        await page.pdf({
            path           : path.join(dest, 'pdf', sanitize(`${String(position).padStart(2, '0')}-${title}.pdf`)),
            printBackground: true,
            format         : "Letter"
        });
    }

    async createHtmlPage(page, dest, position, title) {
        await fs.ensureDir(dest)
        //save html of a page
        const html = await page.content();
        await fs.writeFile(path.join(dest, sanitize(`${String(position).padStart(2, '0')}-${title}.html`)), html);
        await this.delay(1e3)
    }

    async createFullPageScreenshot(page, dest, position, title) {
        await fs.ensureDir(dest)
        await page.screenshot({
            path    : path.join(dest, sanitize(`${String(position).padStart(2, '0')}-${title}-full.png`)),
            fullPage: true
        });
    }

    async createMarkdownFromHtml(page, course, index, title, opts) {
        const nhm = new NodeHtmlMarkdown();
        let position = index + 1
        let markdown = await page.evaluate(() => Array.from(document.body.querySelectorAll(".ed-grid-main"), txt => txt.outerHTML)[0]);
        if (!markdown) {
            console.log('-----------------nema markdown', title);
            await this.createFullPageScreenshot(page, path.join(opts.dir, sanitize(course.title), 'error'), 0, title);
            throw new Error(`No Markdown found - ${title}\``)
        }
        await fs.ensureDir(path.join(opts.dir, sanitize(course.title), 'markdown'))
        await fs.writeFile(path.join(opts.dir, sanitize(course.title), 'markdown', sanitize(`${String(position).padStart(2, '0')}-${title}.md`)), nhm.translate(markdown), 'utf8')
        await this.delay(1e3)
    }

    async clickOnShowMoreButtonForCourses(page) {
        try {
            //click on 'Show More' button
            await page.waitForSelector('div.mt-3 > button > svg', {
                timeout: 15e3
            })
            await page.click('div.mt-3 > button > svg')
            await page.waitForTimeout(1e3)
            console.log('show more button');
            return await this.clickOnShowMoreButtonForCourses(page)
        } catch (e) {
            return;
        }
    }

    addPageAsDownloaded(course, opts, index, lesson) {
        let series = sanitize(course.title)
        const dest = path.join(opts.dir, series, `${String(index + 1).padStart(2, '0')}-${lesson.title}`)
        const videoLogger = createLogger(path.join(opts.dir, series));
        videoLogger.write(`${dest}\n`);
    }

    fileIsDownloaded(course, opts, index, lesson) {
        let series = sanitize(course.title)
        const dest = path.join(opts.dir, series, `${String(index + 1).padStart(2, '0')}-${lesson.title}`)
        let isDownloaded = isCompletelyDownloaded(path.join(opts.dir, series), dest)
        // console.log('isDownloaded', isDownloaded, lesson.title);
        return isDownloaded;
    }

    async isHeadlessMode(browser) {
        // const u = await page.evaluate('navigator.userAgent');
        const ua = await browser.userAgent()
        // console.log('UA::', ua, ua.toLowerCase().includes('headlesschrome'))
        return ua.toLowerCase().includes('headlesschrome')
    }
}

