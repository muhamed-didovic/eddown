const createLogger = require('./helpers/createLogger')
const Crawler = require('./Crawler')

const Bluebird = require('bluebird')
Bluebird.config({ longStackTraces: true })
global.Promise = Bluebird;

const Spinnies = require('dreidels')
const ms = new Spinnies()

exports.scrape = async (opts = {}) => {
    const url = opts.courseUrl;
    // if (!url) throw new TypeError('`url` is required.')
    // if (typeof url !== 'string') throw new TypeError(`Expected "url" to be of type "string", but "${typeof url}".`)

    opts = normalizeOpts(opts)
    console.log('opts', opts);
    const { logger, file, filePath, all } = opts

    let crawler = new Crawler()
    const courses = file ? require(filePath) : await crawler.scrapeCourses({ms, ...opts}, url)
    //return;
    if (!courses?.length) {
        console.log('no courses found :(');
        return;
    }
    console.log('found lessons: ', courses?.length);
    const prefix = all ? 'all-courses' : 'single-course'
    const filename = `${prefix}-${new Date().toISOString()}.json`
    /*if (file) {
        await crawler.d(filename, prefix, courses, {ms, ...opts});
    }*/
    await crawler.writeVideosIntoFile(file, logger, prefix, courses, filename)
}

function normalizeOpts(opts) {
    if (!opts.dir) opts.dir = process.cwd()
    if (!opts.logger) opts.logger = require('./helpers/nullLogger')
    if (!opts.logger.isLogger) opts.logger = createLogger(opts.logger)
    if (!opts.concurrency) opts.concurrency = 10
    // if (!opts.overwrite) opts.overwrite = 'no'
    if (!('overwrite' in opts)) opts.overwrite = 'no'
    if (!('html' in opts)) opts.html = 'yes'
    return opts
}
