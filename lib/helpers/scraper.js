const path = require("path")
const sanitize = require("sanitize-filename")
const fs = require('fs-extra')
const downOverYoutubeDL = require('./downOverYoutubeDL')
const req = require('requestretry')
const j = req.jar()
const request = req.defaults({
    jar         : j,
    retryDelay  : 500,
    fullResponse: true
})

// const scrape = require('website-scraper').default;
// const SaveToExistingDirectoryPlugin = require('website-scraper-existing-directory').default;

// const { default: scrape } = require('website-scraper');
// const { default: SaveToExistingDirectoryPlugin } = require('website-scraper-existing-directory');
// console.log(myModule.foo); // Output: 'bar'
// /cdn-cgi/image/format=auto,width=16,quality=75/v2api/collection/5382378601054208/4655029643378688/image/6229941594095616
const extractVimeoFromIframe = async (page, sourceUrl) => {
    const vimeoUrl = await retry(async () => {
        //wait for an iframe
        await page.waitForSelector(`pierce/iframe`, {
            waitUntil: 'networkidle0',
            timeout  : 32e3
        })

        // let iframeSrc = await page.evaluate(() => Array.from(document.body.querySelectorAll('video-player'), elem => elem?.shadowRoot?.querySelector("iframe").src)[0])

        const { vimeoId, youtubeId } = await page.evaluate(() => {
            const vimeoId = document.querySelector("global-data").vimeo; // get id for vimeo video
            const youtubeId = document.querySelector("global-data").youtube;
            return {
                vimeoId,
                youtubeId
            }
        })
        const selectedVideo = await this.vimeoRequest(`https://player.vimeo.com/video/${vimeoId}`, sourceUrl)
        return selectedVideo.url;
    }, 6, 1e3, true);
    return vimeoUrl;
}
/*const getSizeOfVideo = async (course) => {
    const vimeoUrl = await this.extractVimeoFromIframe(page, course.url);
    const vimeoUrl = course.vimeoUrl

    try {
        const {
                  headers,
                  attempts: a
              } = await request({
            url         : vimeoUrl, //v,
            json        : true,
            maxAttempts : 50,
            method      : 'HEAD',
            fullResponse: true, // (default) To resolve the promise with the full response or just the body
        })

        return {
            url : vimeoUrl, //v
            size: headers['content-length']
        }
    } catch (err) {
        console.log('ERR::', err)
        /!*if (err.message === 'Received invalid status code: 404') {
            return Promise.resolve();
        }*!/
        throw err
    }
};*/
const scrollToBottomBrowser = async (timeout, viewportN) => {
    await new Promise((resolve) => {
        let totalHeight = 0, distance = 200, duration = 0, maxHeight = window.innerHeight*viewportN;
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

    /*page.on('request', (interceptedRequest) => {
        if (interceptedRequest.isInterceptResolutionHandled()) return;
        if (
            interceptedRequest.url().endsWith('.png') ||
            interceptedRequest.url().endsWith('.jpg')
        )
            interceptedRequest.abort();
        else interceptedRequest.continue();
    });*/

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

class MyPlugin {
    apply(registerAction) {
        // registerAction('beforeStart', async ({options}) => {});
        // registerAction('afterFinish', async () => {});
        // registerAction('error', async ({error}) => {console.error(error)});
        // registerAction('beforeRequest', async ({resource, requestOptions}) => ({requestOptions}));
        // registerAction('afterResponse', async ({response}) => response.body);
        // registerAction('onResourceSaved', ({resource}) => {});
        // registerAction('onResourceError', ({resource, error}) => {});
        // registerAction('saveResource', async ({resource}) => {});
        // registerAction('generateFilename', async ({resource}) => {})
        // registerAction('getReference', async ({resource, parentResource, originalReference}) => {})
        /*registerAction('beforeRequest',  async (a) => {
            console.log('a', a);
            // if (resource.filename.indexOf('.html') != -1) {
            //     console.log('found html resource, encoding with utf-8', resource.filename);
            //     //requestOptions.encoding = 'utf8';
            // } else {
            //     //requestOptions.encoding = 'binary';
            // }
            // return { requestOptions, resource };
        })*/
        /*;
        registerAction('saveResource', async ({resource}) => {
            const filename = resource.getFilename();
            console.log('filename', filename);
            // const text = resource.getText();
            // await saveItSomewhere(filename, text);
        })*/
    }
}

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
        /*registerAction('getReference', ({ resource, parentResource, originalReference }) => {
            if (!resource) {
                if (originalReference.includes('player.vimeo.com')) {
                    console.log('1----parentResource, ', parentResource.url, 'originalReference:', originalReference, 'new: ', `media/${originalReference.split('/').pop()}.mp4`);
                   // return `media/${originalReference.split('/').pop()}.mp4`
                    return { reference:`media/${originalReference.split('/').pop()}.mp4`};
                }
            }

            // if (!resource)
            //     return { reference: parentResource.url + originalReference }; // this line transforms the url of images
            // return { reference: resource.url };
            //
            // if (!resource) {
            //     return {reference: parentResource.url + originalReference}
            // }
            // return {reference: utils.getRelativePath(parentResource.filename, resource.filename)};
        });*/

        registerAction('afterResponse', async ({ response }) => {
            const contentType = response.headers['content-type'];
            const isHtml = contentType && contentType.split(';')[0] === 'text/html';
            if (isHtml) {
                const url = response.url;
                const opts = this.opts
                const page = this.page
                // const course = this.lesson
                //const page = await this.browser.newPage();

                // if (hasValues(this.headers)) {
                //     // logger.info('set headers to puppeteer page', this.headers);
                //     await page.setExtraHTTPHeaders(this.headers);
                // }
                console.log('Digesting url:', url);
                if (this.blockNavigation) {
                    await blockNavigation(page, url);
                }


                //find images that don't have extension
                const imageFound = await page.$('img[src*="/image/"]') !== null// /api/collection/
                if (imageFound) {
                    console.log('imageFound', imageFound);
                    const images = await page.evaluate(async () => {
                        const appendPngToImageUrl = str => {
                            const regex = /\/image\/([\w-]+)(\?|$)/;  // define regex to match the number after "/image/", allowing alphanumeric and hyphen characters, and allowing for an optional question mark at the end of the string
                            const match = str.match(regex);   // search for a match in the string

                            if (match) {
                                const imgNum = match[1];          // get the matched number
                                const imgUrl = imgNum + ".png";   // append ".png" to the number
                                const newStr = str.replace(regex, `/image/${imgUrl}$2`);  // replace the matched substring with the new URL, keeping the optional question mark
                                return newStr;                   // return the resulting string
                            }
                        };

                        //find all iframe with vimeo links, download video and replace them
                        const images = document.querySelectorAll('img[src*="/image/"]');//img[src*="/api/collection/"],
                        let srcs = []
                        images.forEach((image, index) => {

                            const str = image.getAttribute('src');
                            srcs.push(str)
                            const newStr =  appendPngToImageUrl(str)
                            srcs.push(newStr)
                            image.setAttribute("src",newStr);
                            image.removeAttribute('srcset');

                        });
                        return srcs;
                    });
                    console.log('images', images);
                }

                //check for wierd svg
                const svg = await page.$('object[role="img"]') !== null
                if (svg) {
                    console.log('svg', svg);
                    const svgs = await page.evaluate(async () => {
                        //find all iframe with vimeo links, download video and replace them
                        const iFrame = document.querySelectorAll('object[role="img"]');
                        let srcs = []
                        iFrame.forEach((myObject, index) => {
                            const svgDocument = myObject.contentDocument;
                            // Get the base64-encoded image data
                            // Get the image element
                            const svgImage = svgDocument.querySelector('image');

// Get the image data from the xlink:href attribute
                            const imageData = svgImage.getAttribute('xlink:href');
                            //const imageData = svgDocument.querySelector('image').getAttribute('xlink:href');
                            // Get the width and height attributes from the SVG image
                            const imageWidth = svgImage.getAttribute('width');
                            const imageHeight = svgImage.getAttribute('height');

                            // Set the data, width, and height attributes on the object element
                            myObject.setAttribute('data', imageData);
                            myObject.setAttribute('style', `width: ${imageWidth}px; height: ${imageHeight}px;`);//max-width: 100%; height: auto;
                            // myObject.setAttribute('width', imageWidth);
                            // myObject.setAttribute('height', imageHeight);
                            srcs.push(imageData)
                        });
                        return srcs;
                    });
                    // console.log('svgs', svgs);
                }

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

                    // console.log('srcs', srcs);
                    await Promise.map(srcs, async (url, index) => {
                            // console.log('url--------------------', url);
                            // const dest = path.join(opts.dir, course.downPath)
                            // fs.ensureDir(dest)
                            // const details = await getSizeOfVideo(course)
                            const details = {
                                size: -1,
                                url : url
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
        });

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


const scraper = async (opts, page, directory, lesson) => {

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
            { selector: 'img', attr: 'src' },
            // { selector: 'img', attr: 'srcset' },
            { selector: 'input', attr: 'src' },
            { selector: 'object', attr: 'data' },
            { selector: 'embed', attr: 'src' },
            { selector: 'param[name="movie"]', attr: 'value' },
            { selector: 'script', attr: 'src' },
            { selector: 'link[rel="stylesheet"]', attr: 'href' },
            { selector: 'link[rel*="icon"]', attr: 'href' },
            { selector: 'svg *[xlink\\:href]', attr: 'xlink:href' },
            { selector: 'svg *[href]', attr: 'href' },
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
        plugins  : [
            new PuppeteerPlugin({
                opts,
                scrollToBottom : { timeout: 10000, viewportN: 10 }, /* optional */
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

module.exports = scraper
