#!/usr/bin/env node
const meow = require('meow')
const prompts = require('prompts')
const createLogger = require('./helpers/createLogger')
const { scrape } = require('.')
const path = require('path')
const fs = require('fs-extra')
const isValidPath = require('is-valid-path')
const isEmail = require('util-is-email').default
const Fuse = require('fuse.js')
const Crawler = require("./Crawler");

const cli = meow(`
Usage
    $ eddown [CourseUrl]

Options
    --all, -a           Get all courses from particular school or provider.
    --email, -e         Your email.
    --password, -p      Your password.
    --directory, -d     Directory to save.
    --overwrite, -o     Overwrite if resource exists (values: 'yes' or 'no'), default value is 'no'
    --headless, -h      Enable headless (values: 'yes' or 'no'), default value is 'yes'
    --concurrency, -c

Examples
    $ eddown
    $ eddown -a
    $ eddown [url] [-l url...] [-e user@gmail.com] [-p password] [-d dirname] [-c number] [-o yes or no] [-h yes or no]
`, {
    hardRejection: false,
    flags        : {
        help       : { alias: 'h' },
        version    : { alias: 'v' },
        all        : {
            type : 'boolean',
            alias: 'a'
        },
        email      : {
            type : 'string',
            alias: 'e'
        },
        password   : {
            type : 'string',
            alias: 'p'
        },
        directory  : {
            type : 'string',
            alias: 'd'
        },
        concurrency: {
            type   : 'number',
            alias  : 'c',
            default: 10
        },
        /*file       : {
            type   : 'boolean',
            alias  : 'f',
            default: false
        },*/
        overwrite  : {
            type: 'string',
            alias: 'o',
            default: 'no'
        },
        headless  : {
            type: 'string',
            alias: 'h',
            default: 'yes'
        }
    }
})

const logger = createLogger()
// const errorHandler = err => (console.log('\u001B[1K'), logger.fail(String(err)), process.exit(1))
// const errorHandler = err => (console.error(err), logger.fail(String(err)), process.exit(1))
const errorHandler = err => (console.error('MAIN errorr:', err), process.exit(1))//logger.fail(`HERE IS THE ERROR in string: ${String(err}`))
const askOrExit = question => prompts({ name: 'value', ...question }, { onCancel: () => process.exit(0) }).then(r => r.value)
const folderContents = async (folder) => {
    const files = await fs.readdir(folder)
    if (!files.length) {
        return console.log('No files found')
    }
    // console.log(`found some files: ${files.length} in folder: ${folder}`);
    return files.map(file => ({
        title: file,
        value: path.join(folder, file)
    }))
}

(async () => {
    const { flags, input } = cli
    let all = flags.all
    let courseUrl;
    if (all || (input.length === 0 && await askOrExit({
        type   : 'confirm',
        message: 'Do you want all courses?',
        initial: false
    }))) {
        all = true;
    } else {
        if (input.length === 0) {
            const searchOrDownload = flags.file || await askOrExit({
                type   : 'confirm',
                message: 'Choose "Y" if you want to search for a course otherwise choose "N" if you have a link for download',
                initial: true
            })

            if (input.length === 0 && searchOrDownload === false) {
                input.push(await askOrExit({
                    type   : 'text',
                    message: 'Enter url for download.',
                    initial: 'https://www.educative.io/courses/javascript-fundamentals-before-learning-react',
                    // initial: 'https://www.educative.io/courses/introduction-to-programming-in-go',
                    validate: value => value.includes('educative.io') ? true : 'Url is not valid'
                }))
            } else {
                let searchCoursesFile = false;
                if (await fs.exists(path.resolve(process.cwd(), 'json/search-courses.json'))) {
                    searchCoursesFile = true;
                }

                const foundSearchCoursesFile = await askOrExit({
                    type   : (searchCoursesFile && input.length === 0 && !flags.file) ? 'confirm' : null,
                    message: 'Do you want to search for a courses from a local file (which is faster)',
                    initial: true
                })

                input.push(await askOrExit({
                    type   : 'autocomplete',
                    message: 'Search for a course',
                    choices: await Crawler.getCourses(foundSearchCoursesFile),
                    suggest: (input, choices) => {
                        if (!input) return choices;
                        const fuse = new Fuse(choices, {
                            keys: ['title', 'value']
                        })
                        return fuse.search(input).map(i => i.item);
                    },
                }))
            }
        }
        courseUrl = input[0]
    }

    /*const file = flags.file || await askOrExit({
        type   : 'confirm',
        message: 'Do you want download from a file (choose "N" if you dont care)',
        initial: false
    })

    const filePath = flags.file || await askOrExit({
        type    : file ? 'autocomplete' : null,
        message : `Enter a file path eg: ${path.resolve(process.cwd(), 'json/*.json')} `,
        choices : await folderContents(path.resolve(process.cwd(), 'json')),
        validate: isValidPath
    })*/

    const email = flags.email || await askOrExit({
        type    : 'text',
        message : 'Enter email',
        validate: value => value.length < 5 ? 'Sorry, enter correct email' : true
    })
    const password = flags.password || await askOrExit({
        type    : 'text',
        message : 'Enter password',
        validate: value => value.length < 5 ? 'Sorry, password must be longer' : true
    })
    const dir = flags.directory || path.resolve(await askOrExit({
        type    : 'text',
        message : `Enter a directory to save (eg: ${path.resolve(process.cwd())})`,
        initial : path.resolve(process.cwd(), 'videos/'),
        validate: isValidPath
    }))

    const concurrency = flags.concurrency || await askOrExit({
        type   : 'number',
        message: 'Enter concurrency',
        initial: 10
    })
    const overwrite = (['yes', 'no', 'y', 'n'].includes(flags.overwrite)
        ? flags.overwrite
        : await askOrExit({
            type   : 'select',
            message: 'Do you want to overwrite when the file name is the same?',
            choices: [
                {
                    title: 'Yes',
                    value: 'yes'
                },
                {
                    title: 'No',
                    value: 'no'
                }
            ],
            initial: 1
        }))
    const headless = (['yes', 'no', 'y', 'n'].includes(flags.headless)
        ? flags.headless
        : await askOrExit({
            type   : 'select',
            message: 'Enable headless?',
            choices: [
                {
                    title: 'Yes',
                    value: 'yes'
                },
                {
                    title: 'No',
                    value: 'no'
                }
            ],
            initial: 1
        }))

    scrape({
        all,
        email,
        password,
        logger,
        dir,
        concurrency,
        // file,
        // filePath,
        courseUrl,
        overwrite,
        headless
    }).catch(errorHandler)
})()
