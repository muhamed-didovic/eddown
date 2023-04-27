const path = require('path')
const fs = require('fs-extra')
const sanitize = require("sanitize-filename");
const { differenceBy } = require("lodash");

const getFilesizeInBytes = filename => {
    return fs.existsSync(filename) ? fs.statSync(filename)["size"] : 0;
};

const createLogger = downloadFolder => {
    const logFile = path.join(downloadFolder, 'downloads.txt')
    fs.ensureDirSync(downloadFolder)
    /* fs.existsSync(logFile) ?
         console.log(`File ${logFile} already exists`) :
         console.log(`File ${logFile} created`);*/
    return fs.createWriteStream(logFile, { flags: 'a' });
};

const findDownloadedVideos = downloadFolder => {
    const logFile = path.join(downloadFolder, 'downloads.txt')
    if (!fs.existsSync(logFile)) return [];
    return fs.readFileSync(logFile).toString().split("\n");
}

const isCompletelyDownloaded = (downloadFolder, videoName) => {
    const downloadedVideos = findDownloadedVideos(downloadFolder);
    if (typeof downloadedVideos === 'undefined' || downloadedVideos.length === 0) {
        return false;
    }
    videoName = `${videoName}`
    for (let downloadedVideoName of downloadedVideos) {
        // console.log('downloadedVideoName', videoName === downloadedVideoName, videoName,  downloadedVideoName);
        if (videoName === downloadedVideoName) {
            return downloadedVideoName;
        }
    }
    return false;
}

const findNotExistingVideo = (videos, downloadFolder) => {
    let i = 0;
    for (let video of videos) {
        const name = video.name.toString().replace(/[^A-Za-zА-Яа-я\d\s]/gmi, '').replace('Урок ', '');
        let filename = path.join(downloadFolder, `${name}.mp4`);
        if (fs.existsSync(filename) && isCompletelyDownloaded(name, downloadFolder)) {
            console.log(`File "${name}" already exists`);
            i++;
        } else {
            break;
        }
    }
    return i;
};

const removeDownloadedLessons = async (course, opts, pages, lessonsByCheerio) => {
    let series = sanitize(course.title)
    const logFile = path.join(__dirname, '/../../', opts.dir, series, `downloads.txt`)

    if (!await fs.exists(logFile)) {
        console.log('Downloads file is not found!!!');
        return lessonsByCheerio;
    }

    const downloadsFile = fs
        .readFileSync(logFile)
        .toString()
        .split("\n")
        .filter(Boolean) //remove empty lines if they exist
    console.log(`Length of Downloaded lessons: ${downloadsFile.length} and length of whole course: ${lessonsByCheerio.length} and their difference is: ${lessonsByCheerio.length - downloadsFile.length}`);

    const links = lessonsByCheerio.filter((lesson, index) => {
        /*console.log('comapre',
            path.join(__dirname, '/../../' , opts.dir, series, `${String(index + 1).padStart(2, '0')}-${lesson.title}`),
            !downloadsFile.includes(path.join(__dirname, '/../../', opts.dir, series, `${String(index + 1).padStart(2, '0')}-${lesson.title}`)),
            !downloadsFile.includes(path.join(opts.dir, series, `${String(index + 1).padStart(2, '0')}-${lesson.title}`))
        );*/

        //if file is list of lessonsByCheerio
        if (downloadsFile.includes(path.join(opts.dir, series, `${String(index + 1).padStart(2, '0')}-${lesson.title}`))) {
            return false;
        }
        return !downloadsFile.includes(path.join(__dirname, '/../../', opts.dir, series, `${String(index + 1).padStart(2, '0')}-${lesson.title}`))
    })
    console.log('Remaining lessons left:', links.length);
    return links
};

module.exports = {
    findNotExistingVideo,
    isCompletelyDownloaded,
    createLogger,
    removeDownloadedLessons
}
