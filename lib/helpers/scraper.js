const sharp = require('sharp');
const path = require("path")
const sanitize = require("sanitize-filename")
const fs = require('fs-extra')
const downOverYoutubeDL = require('./downOverYoutubeDL')
const svg2png = require('svg2png');

const req = require('requestretry')
const j = req.jar()
const request = req.defaults({
    jar: j,
    retryDelay: 500,
    fullResponse: true
})

// const scrape = require('website-scraper').default;
// const SaveToExistingDirectoryPlugin = require('website-scraper-existing-directory').default;

// const { default: scrape } = require('website-scraper');
// const { default: SaveToExistingDirectoryPlugin } = require('website-scraper-existing-directory');
// console.log(myModule.foo); // Output: 'bar'
// /cdn-cgi/image/format=auto,width=16,quality=75/v2api/collection/5382378601054208/4655029643378688/image/6229941594095616

const scrollToBottomBrowser = async (timeout, viewportN) => {
    await new Promise((resolve) => {
        let totalHeight = 0, distance = 200, duration = 0, maxHeight = window.innerHeight * viewportN;
        const timer = setInterval(() => {
            duration += 200;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= document.body.scrollHeight || duration >= timeout || totalHeight >= maxHeight) {
                clearInterval(timer);
                resolve();
            }
        }, 200);
    });
};
const hasValues = obj => obj && Object.keys(obj).length > 0;
const scrollToBottom = async (page, timeout, viewportN) => {
    // logger.info(`scroll puppeteer page to bottom ${viewportN} times with timeout = ${timeout}`);

    await page.evaluate(scrollToBottomBrowser, timeout, viewportN);
};
const blockNavigation = async (page, url) => {
    // logger.info(`block navigation for puppeteer page from url ${url}`);
    page.on('request', req => {
        if (req.isInterceptResolutionHandled()) return;
        // console.log('req.url() !== url', req.url(), url);
        if (req.isNavigationRequest() && req.frame() === page.mainFrame() && req.url() !== url) {
            req.abort('aborted');
        } else {
            req.continue();
        }
    });
    await page.setRequestInterception(true);
};

class PuppeteerPlugin {
    constructor({
                    opts = {},
                    scrollToBottom = null,
                    blockNavigation = false,
                    page = null,
                    lesson = false,
                    directory = false
                } = {}) {
        this.opts = opts;
        this.scrollToBottom = scrollToBottom;
        this.blockNavigation = blockNavigation;
        this.headers = {};
        this.lesson = lesson
        this.page = page
        this.directory = directory
        // logger.info('init plugin', { launchOptions, scrollToBottom, blockNavigation });

        // let position = index + 1
        this.dest = path.join(this.directory, 'media')
        //this.dest = path.join(opts.dir, sanitize(lesson.title), 'media')
        // fs.ensureDir(this.dest)
        // console.log('__dirname:', __dirname);
        // console.log('iframe videos folder', this.dest);
    }

    apply(registerAction) {
        registerAction('afterResponse', async ({ response }) => {
                const contentType = response.headers['content-type'];
                const isHtml = contentType && contentType.split(';')[0] === 'text/html';
                if (isHtml) {
                    // console.log('response', response);
                    const url = response.url;
                    const opts = this.opts
                    const page = this.page

                    // console.log('Digesting url:', url);
                    if (this.blockNavigation) {
                        await blockNavigation(page, url);
                    }

                    // await page.waitForSelector(
                    //     'aria/Captions (c)',
                    //     { timeout: 0 }
                    // );

                    let counters, objsCounter;
                    const imagesFolder = path.join(this.directory, 'media')
                    fs.ensureDir(imagesFolder)

                    //find images that don't have extension
                    const imageFound = await page.$('img[src*="/image/"]', { visible: true }) !== null// /api/collection/
                    const images = await page.$$('img[src*="/image/"]', { visible: true });
                    if (images) {
                        // console.log('imageFound', imageFound);
                        // const images = await page.$$('img[src*="/image/"]', { visible: true });
                       /* const propertyJsHandles = await Promise.all(images.map(handle => {
                            const src = handle.getProperty('src')
                            // console.log('src:::', src);
                            return src;
                        }));
                        const s = await Promise.all(propertyJsHandles.map(handle => {
                            // console.log('handle.jsonValue()', handle.jsonValue());
                            return handle.jsonValue();
                        }));
                        console.log('sssss', s);*/


                        counters = await Promise
                            .mapSeries(images, async (image, i) => {

                                if (fs.existsSync(path.join(imagesFolder, `screenshot_${i}.png`))) {
                                    console.log('image if downloaded', path.join(imagesFolder, `screenshot_${i}.png`));
                                    return;
                                }
                                const bound = await image.boundingBox();// !== null
                                // console.log('1-------------', bound);
                                if (bound && bound.width > 0) {

                                    const screenshotData = await image.screenshot({ encoding: "base64" });
                                    // console.log('2-------------', screenshotData);
                                    const screenshotBuffer = Buffer.from(screenshotData, 'base64');

                                    const imageSharp = sharp(screenshotBuffer);
                                    const { width, height } = await imageSharp.metadata();

                                    if (width === 0) {
                                        console.error('Screenshot has a width of 0!');
                                        return false
                                    } else {
                                        console.log(`Screenshot has dimensions ${width}x${height}.`);
                                    }

                                    fs.writeFileSync(path.join(imagesFolder, `screenshot_${i}.png`), screenshotData);
                                    // console.log('ima:', await image.evaluate(el => el.src));
                                    await page.waitForTimeout(2e3)
                                    return {
                                        i,
                                        screenshotData
                                    }
                                } else {
                                    // console.log('nema:', await image.evaluate(el => el.src));
                                    return false;
                                }

                            })
                            .then(async counters => {
                                counters = counters.filter(Boolean)//Number.isInteger
                                for (const { i, screenshotData } of counters) {
                                    // console.log('----ovo je count slike:', i);

                                    const image = images[i];
                                    await image.evaluate((el, screenshotData) => {
                                        el.src = `data:image/png;base64,${screenshotData}`;
                                        // el.setAttribute('src', `data:image/png;base64,${screenshotData}`);
                                        el.removeAttribute('srcset');
                                    }, screenshotData);

                                }

                            })
                    }
                    const obj = await page.$('object[role="img"]', { visible: true }) !== null
                    if (obj) {
                        const objs = await page.$$('object[role="img"]', { visible: true });
                        const selector = 'object[role="img"]'
                        objsCounter = await Promise
                            .mapSeries(objs, async (svgElement, i) => {
                                //for (let i = 0; i < objs.length; i++) {
                                //     const svg = objs[i];
                                // console.log('image', image);

                                if (fs.existsSync(path.join(imagesFolder, `obj-${i}.png`))) {
                                    console.log('obj if downloaded', path.join(imagesFolder, `obj-${i}.png`));
                                    return;
                                }

                                const screenshotData = await svgElement.screenshot({ encoding: "base64" });
                                fs.writeFileSync(path.join(imagesFolder, `obj-${i}.png`), screenshotData, 'base64');
                                await page.waitForTimeout(2e3)

                                return screenshotData;

                                // const screenshot = await svg.screenshot();
                                // fs.writeFileSync(path.join(imagesFolder, `obj-${i}.png`), screenshot);
                                await page.waitForTimeout(2e3)
                                // await page.waitForTimeout(2e3)
                                //}
                                return i;
                            })
                            .then(async screens => {

                                // const svg = objsCounter[i];
                                // await svg.evaluate((el, index) => {
                                //     el.data = `media/obj-${index}.png`;
                                // }, i);

                                await page.evaluate((selector, screens) => {
                                    const svgElements = document.querySelectorAll(selector);
                                    svgElements.forEach((svgElement, i) => {
                                        const imgElement = document.createElement('img');
                                        // imgElement.src = `data:image/png;base64,${btoa(screens[i])}`;
                                        imgElement.setAttribute('src', `data:image/png;base64,${screens[i]}`);
                                        // imgElement.width = svgElement.getAttribute('width');
                                        // imgElement.height = svgElement.getAttribute('height');
                                        // imgElement.style = svgElement.getAttribute('style');

                                        svgElement.parentNode.replaceChild(imgElement, svgElement);
                                    });
                                }, selector, screens);
                                return screens;
                            })
                    }

                    const svg = await page.$("div[id*='widget-parent'] .canvas-svg-viewmode svg", { visible: true }) !== null
                    if (svg) {
                        const svgElements = await page.$$("div[id*='widget-parent'] .canvas-svg-viewmode svg", { visible: true });
                        // console.log('svgElements', svgElements);
                        const svgSelector = "div[id*='widget-parent'] .canvas-svg-viewmode svg";

                        const s = await Promise
                            .mapSeries(svgElements, async (svgElement, i) => {

                                const screenshotData = await svgElement.screenshot({ encoding: "base64" });
                                fs.writeFileSync(path.join(imagesFolder, `sss-${i}.png`), screenshotData, 'base64');
                                await page.waitForTimeout(2e3)

                                return screenshotData;
                            })
                            .then(async screens => {
                                await page.evaluate((selector, screens) => {
                                    const svgElements = document.querySelectorAll(selector);
                                    svgElements.forEach((svgElement, i) => {
                                        const imgElement = document.createElement('img');
                                        // imgElement.src = `data:image/png;base64,${btoa(screens[i])}`;
                                        imgElement.setAttribute('src', `data:image/png;base64,${screens[i]}`);
                                        // imgElement.width = svgElement.getAttribute('width');
                                        // imgElement.height = svgElement.getAttribute('height');
                                        // imgElement.style = svgElement.getAttribute('style');

                                        svgElement.parentNode.replaceChild(imgElement, svgElement);
                                    });
                                }, svgSelector, screens);
                                return screens;
                            })

                        // console.log('sssss', s);
                        /*for (const svgElement of svgElements) {


                            // Create an <img> element and copy the width, height, and style properties of the SVG element to it
                            const imgElement = await page.evaluate((svgProps, imageData) => {
                                const img = document.createElement('img');
                                // Copy the width, height, and style attributes from the SVG element to the <img> element if they exist
                                if (svgProps.width) img.setAttribute('width', svgProps.width);
                                if (svgProps.height) img.setAttribute('height', svgProps.height);
                                if (svgProps.style) img.setAttribute('style', svgProps.style);
                                // Set the src attribute of the <img> element to the base64-encoded string
                                img.setAttribute('src', `data:image/png;base64,${imageData}`);
                                // this.parentElement.insertBefore(img, this);
                                // this.parentElement.removeChild(this);
                                return img.outerHTML;
                            }, await svgElement.getProperties(['width', 'height', 'style']), screenshotData);
                            console.log('imgElement', imgElement);

                        }*/


                        // Save the

                        /*for (let svg of svgs) {
                            const imgData = await svg.screenshot();
                            const img = await page.evaluate(({ imgData: data,  svg }) => {
                                const img = document.createElement('img');
                                img.src = 'data:image/png;base64,' + data.toString('base64');
                                img.setAttribute('width', svg.width.baseVal.value.toString());
                                img.setAttribute('height', svg.height.baseVal.value.toString());
                                svg.parentNode.replaceChild(img, svg);
                                return img;
                            }, {imgData, svg});
                        }*/


                        /*const a = await Promise
                            .mapSeries(svgs, async (svg, i) => {
                                //for (let i = 0; i < svgs.length; i++) {
                                //     const svg = svgs[i];
                                // console.log('image', image);
                                if (fs.existsSync(path.join(imagesFolder, `svg-${i}.png`))) {
                                    console.log('svg is downloaded',path.join(imagesFolder, `svg-${i}.png`));
                                    return;
                                }
                                const bound = await svg.boundingBox() !== null;
                                if (bound ) {
                                    const screenshot = await svg.screenshot();
                                    fs.writeFileSync(path.join(imagesFolder, `svg-${i}.png`), screenshot);

                                    // const png = svg2png.sync(await svg.evaluate(el => el.outerHTML));
                                    // fs.writeFileSync(path.join(imagesFolder, `svg-${i}.png`), png);

                                    await page.waitForTimeout(1e3)


                                    // await page.waitForTimeout(2e3)
                                    //}
                                    //return svg.evaluate(el => el.getAttribute("xlink:href"))
                                    return i
                                } else {
                                    // return {
                                    //     'nema': await image.evaluate(el => el.src)
                                    // }
                                    //el.setAttribute("xlink:href"
                                    console.log('nema svega:', await svg.evaluate(el => el.getAttribute("xlink:href")));
                                    return false;
                                }

                            })
                            .then(async counters => {
                                //counters = counters.filter(Number.isInteger)
                                const numbersOnly = counters.filter(element => typeof element === 'number' && !Number.isNaN(element));
                                console.log('svg counters', numbersOnly);


                                // for (let i = 0; i < svgs.length; i++) {
                                //     console.log('----ovo je count svg-a:', i);
                                //     const svg = svgs[i];
                                //     await svg.evaluate((el, index) => {
                                //         el.setAttribute("xlink:href", `media/svg-${index}.png`)
                                //         //el.data = `media/svg-${index}.png`;
                                //     }, i);
                                // }

                                return await Promise
                                    .mapSeries(numbersOnly, async (i) => {
                                        console.log('----ovo je count svg-a:', i, ':counters:',numbersOnly);

                                        const svg = svgs[i];
                                        /!*await svg.evaluate((el, index) => {
                                            // el.setAttribute("xlink:href", `media/svg-${index}.png`)
                                            //el.data = `media/svg-${index}.png`;

                                            // const imgElement = document.createElement('img');
                                            // imgElement.className = 'dark:bg-gray-200';
                                            // // const newStr =  appendPngToImageUrl(myObject.getAttribute('data'))
                                            // imgElement.src = `media/svg-${index}.png`;
                                            // imgElement.setAttribute('aria-label', 'svg viewer');
                                            // imgElement.setAttribute('role', 'img');
                                            // imgElement.style.maxWidth = '100%';
                                            // imgElement.style.height = 'auto';
                                            // svg.replaceWith(imgElement);
                                        }, i);*!/

                                        const img = document.createElement('img');

                                        // Copy attributes from SVG to img
                                        const newStr = `data:image/svg+xml;utf8,${svg.outerHTML}`
                                        img.src = newStr;
                                        //srcs.push(newStr)
                                        img.width = svg.getAttribute('width');
                                        img.height = svg.getAttribute('height');

                                        // Replace SVG with img
                                        svg.parentNode.replaceChild(img, svg);
                                        return newStr;
                                    })
                                    .then(s => console.log('++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++', s))
                                /!*for (let i of counters) {
                                    console.log('----ovo je count svg-a:', i);

                                    const svg = svgs[i];
                                    await svg.evaluate((el, index) => {
                                        // el.setAttribute("xlink:href", `media/svg-${index}.png`)
                                        //el.data = `media/svg-${index}.png`;

                                        const imgElement = document.createElement('img');
                                        imgElement.className = 'dark:bg-gray-200';
                                        // const newStr =  appendPngToImageUrl(myObject.getAttribute('data'))
                                        imgElement.src = `media/svg-${index}.png`;
                                        imgElement.setAttribute('aria-label', 'svg viewer');
                                        imgElement.setAttribute('role', 'img');
                                        imgElement.style.maxWidth = '100%';
                                        imgElement.style.height = 'auto';

                                        svg.replaceWith(imgElement);


                                    }, i);

                                    // const image = images[parseInt(i) - 1];
                                    // await image.evaluate((el, index) => {
                                    //     el.src = `media/screenshot_${index}.png`;
                                    //     el.removeAttribute('srcset');
                                    // }, i);

                                }*!/
                            })*/


                    }

                    /*if (obj && objsCounter) {
                        // for (let i = 0; i < objsCounter.length; i++) {
                        //     console.log('----ovo je count obj-a:', i);
                        //     const svg = objsCounter[i];
                        //     await svg.evaluate((el, index) => {
                        //         el.data = `media/obj-${index}.png`;
                        //     }, i);
                        // }

                        objsCounter = objsCounter.filter(Number.isInteger)
                        console.log('counters objsCounter', objsCounter);
                        for (let i of objsCounter) {
                            console.log('----ovo je count obj-a:', i);
                            const svg = objsCounter[i];
                            await svg.evaluate((el, index) => {
                                el.data = `media/obj-${index}.png`;
                            }, i);

                        }
                    }*/

                    /* if (imageFound && counters) {
                         counters = counters.filter(Number.isInteger)
                         console.log('counters', counters);

                         for (let i of counters) {
                             console.log('----ovo je count slike:', i);

                             const image = images[i];
                             await image.evaluate((el, index) => {
                                 el.src = `media/screenshot_${index}.png`;
                                 el.removeAttribute('srcset');
                             }, i);

                         }
                     }*/

                    const iFrame = await page.$('iframe[src*="player.vimeo"]') !== null
                    if (iFrame) {
                        console.log('iFrame', iFrame);
                        const srcs = await page.evaluate(async () => {
                            //find all iframe with vimeo links, download video and replace them
                            const iFrame = document.querySelectorAll('iframe[src*="player.vimeo"]');
                            let srcs = []
                            iFrame.forEach((item, index) => {
                                let src = item.src;

                                const newItem = document.createElement("video");
                                newItem.style = "width:640px; height:360px";
                                // modify directly link to vimeo video from local media folder
                                // newItem.src = src
                                newItem.src = `media/${src.split('/').pop().split('?')[0]}.mp4`;
                                item.parentNode.replaceChild(newItem, iFrame[index]);
                                newItem.setAttribute("class", "iframe-video-tag-" + index);
                                newItem.setAttribute("controls", "true");
                                //let videoTag = document.getElementsByClassName("iframe-video-tag-" + index);
                                // videoTag.src = src;
                                //modify directly link to vimeo video from local media folder
                                //videoTag.src = `media/${src.split('/').pop()}.mp4`;
                                // return src
                                srcs.push(src)

                            });
                            return srcs;
                        });

                        console.log('video srcs', srcs);
                        await Promise.map(srcs, async (url, index) => {
                                // console.log('url--------------------', url);
                                // const dest = path.join(opts.dir, course.downPath)
                                // fs.ensureDir(dest)
                                // const details = await getSizeOfVideo(course)
                                const details = {
                                    size: -1,
                                    url: url
                                }
                                await downOverYoutubeDL(details, path.join(this.dest, `${url.split('/').pop().split('?')[0]}.mp4`), {
                                    ...opts,
                                    downFolder: this.dest,
                                    index
                                })

                            }
                            // ,{
                            //     concurrency//: 1
                            // }
                        )
                    }

                    await page.waitForTimeout(1e3)
                    if (this.scrollToBottom) {
                        await scrollToBottom(page, this.scrollToBottom.timeout, this.scrollToBottom.viewportN);
                    }

                    const content = await page.content();
                    // await page.close();

                    // convert utf-8 -> binary string because website-scraper needs binary
                    return Buffer.from(content).toString('binary');
                } else {
                    return response.body;
                }
            }
        )
        ;

        // registerAction('afterFinish', async() => {
        //     //check if folder media exists
        //     fs.ensureDir(path.join(this.directory, 'media'))
        //     //copy all files from our media to media folder inside html folder of a particular lesson
        //     await fs.copy(this.dest, path.join(this.directory, 'media'), { overwrite: true, recursive: true })
        //     //remove media folder from within a lesson
        //     fs.remove(path.join(this.dest))
        // });
    }
}


const
    scraper = async (opts, page, directory, lesson) => {

        const { default: scrape } = await import('website-scraper');
        const { default: SaveToExistingDirectoryPlugin } = await import('website-scraper-existing-directory');

        // const { default: myModule } = require('./my-module.mjs');
        // console.log(myModule.foo); // Output: 'bar'
        const urls = [lesson.url];
        /* return Promise.all([
                 import('website-scraper'),
                 // import('website-scraper-puppeteer'),
             ])
             .then(async ([{ default: scrape }]) => {//, { default: PuppeteerPlugin }

                 return true
             });*/
        await scrape({
            // urls     : [
            //     'https://students.learnjavascript.today/lessons/welcome/',
            //     'https://students.learnjavascript.today/lessons/animating-with-js/'
            // ],
            // directory: `./zzz-${new Date().toISOString()}`,
            urls,//: [url],
            directory,
            sources: [
                { selector: 'style' },
                { selector: '[style]', attr: 'style' },
                // { selector: 'img', attr: 'src' },
                // { selector: 'img', attr: 'srcset' },
                { selector: 'input', attr: 'src' },
                // { selector: 'object', attr: 'data' },
                { selector: 'embed', attr: 'src' },
                { selector: 'param[name="movie"]', attr: 'value' },
                { selector: 'script', attr: 'src' },
                { selector: 'link[rel="stylesheet"]', attr: 'href' },
                { selector: 'link[rel*="icon"]', attr: 'href' },
                // { selector: 'svg *[xlink\\:href]', attr: 'xlink:href' },
                // { selector: 'svg *[href]', attr: 'href' },
                { selector: 'picture source', attr: 'srcset' },
                { selector: 'meta[property="og\\:image"]', attr: 'content' },
                { selector: 'meta[property="og\\:image\\:url"]', attr: 'content' },
                { selector: 'meta[property="og\\:image\\:secure_url"]', attr: 'content' },
                { selector: 'meta[property="og\\:audio"]', attr: 'content' },
                { selector: 'meta[property="og\\:audio\\:url"]', attr: 'content' },
                { selector: 'meta[property="og\\:audio\\:secure_url"]', attr: 'content' },
                { selector: 'meta[property="og\\:video"]', attr: 'content' },
                { selector: 'meta[property="og\\:video\\:url"]', attr: 'content' },
                { selector: 'meta[property="og\\:video\\:secure_url"]', attr: 'content' },
                { selector: 'video', attr: 'src' },
                { selector: 'video source', attr: 'src' },
                { selector: 'video track', attr: 'src' },
                { selector: 'audio', attr: 'src' },
                { selector: 'audio source', attr: 'src' },
                { selector: 'audio track', attr: 'src' },
                { selector: 'frame', attr: 'src' },
                { selector: 'iframe', attr: 'src' },
                { selector: '[background]', attr: 'background' },

                //[0].data
                // { selector: 'object[role="img"]', attr: 'data'}, //get source of course on pages
                // { selector: 'a[href*=".zip"]', attr: 'href'}, //get sources on /components page
            ],
            plugins: [
                new PuppeteerPlugin({
                    opts,
                    scrollToBottom: { timeout: 10000, viewportN: 10 }, /* optional */
                    blockNavigation: true, /* optional */
                    page,
                    lesson,
                    directory
                }),
                new SaveToExistingDirectoryPlugin()
                //new MyPlugin()// MyBeforeRequestPlugin()
            ],
            urlFilter: function (url) {
                // console.log('PARSING URL:', url, !url.includes('404'), !url.includes('player.vimeo.com'));
                //return !url.includes('404') || !url.includes('player.vimeo.com');
                // return !(url.includes('404') || url.includes('player.vimeo.com'));

                if (url.includes('1637285686566701')//educative.io
                    || url.includes('player.vimeo.com')
                    || url.includes('courseUrlSlug')
                    || url.includes('google-analytics.com')
                    || url.includes('beacon-v2.helpscout.net')
                    || url.includes('accounts.google.com')
                    || url.includes('googleads.g.doubleclick.net')
                    || url.includes('sentry.io')
                    || url.includes('static.ads-twitter.com')
                    || url.includes('ads-twitter.com')
                    || url.includes('connect.facebook.net')
                    || url.includes('facebook.net')
                    || url.includes('hsforms.com')
                    || url.includes('hubspot.com')

                    || url.includes('facebook.com')) {// url.includes('404') || url.includes('/media/')
                    return false
                }
                return true;
            },
        });
    }
// (async () => {
// })();

module
    .exports = scraper
