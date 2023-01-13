# Downloader and scraper for educative.io for pro members

[![npm](https://badgen.net/npm/v/eddown)](https://www.npmjs.com/package/eddown)
[![Hits](https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fgithub.com%2Fmuhamed-didovic%2Feddown&count_bg=%2379C83D&title_bg=%23555555&icon=&icon_color=%23E7E7E7&title=hits&edge_flat=false)](https://hits.seeyoufarm.com)
[![license](https://flat.badgen.net/github/license/muhamed-didovic/eddown)](https://github.com/muhamed-didovic/eddown/blob/master/LICENSE)

## Requirement
- Node 18
- yt-dlp (https://github.com/yt-dlp/yt-dlp)

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
    --concurrency, -c

Examples
    $ eddown
    $ eddown -a
    $ eddown [url] [-l url...] [-e user@gmail.com] [-p password] [-d dirname] [-c number] [-o yes or no]
```

## License
MIT
