# Downloader and scraper for educative.io for pro members

[![npm](https://badgen.net/npm/v/eddown)](https://www.npmjs.com/package/eddown)
[![Downloads](https://img.shields.io/npm/dm/eddown.svg?style=flat)](https://www.npmjs.org/package/eddown)
[![Hits](https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fgithub.com%2Fmuhamed-didovic%2Feddown&count_bg=%2379C83D&title_bg=%23555555&icon=&icon_color=%23E7E7E7&title=hits&edge_flat=false)](https://hits.seeyoufarm.com)
[![license](https://flat.badgen.net/github/license/muhamed-didovic/eddown)](https://github.com/muhamed-didovic/eddown/blob/main/LICENSE)

## Requirements
- nodejs version >= 18

## Install
```sh
npm i -g eddown
```

#### without Install
```sh
npx eddown
```

## CLI
```sh
Usage
    $ eddown [CourseUrl]

Options
    --all, -a           Get all courses from particular school or provider.
    --email, -e         Your email.
    --password, -p      Your password.
    --directory, -d     Directory to save.
    --file, -f          Location of the file where are the courses
    --overwrite, -o     Overwrite if resource exists (values: 'yes' or 'no'), default value is 'no'
    --headless, -h      Enable headless (values: 'yes' or 'no'), default value is 'yes'
    --html, -t         Enable html download (values: 'yes' or 'no'), default value is 'yes'
    --concurrency, -c

Examples
    $ eddown
    $ eddown -a
    $ eddown [url] [-l url...] [-e user@gmail.com] [-p password] [-d dirname] [-c number] [-o yes or no] [-h yes or no] [-t yes or no]
```

## Log and debug
This module uses [debug](https://github.com/visionmedia/debug) to log events. To enable logs you should use environment variable `DEBUG`.
Next command will log everything from `scraper`
```bash
export DEBUG=scraper*; eddown
```

Module has different loggers for levels: `scraper:error`, `scraper:warn`, `scraper:info`, `scraper:debug`, `scraper:log`. Please read [debug](https://github.com/visionmedia/debug) documentation to find how to include/exclude specific loggers.

## License
MIT
