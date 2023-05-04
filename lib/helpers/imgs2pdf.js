const PDFDocument = require('pdfkit')
const fs = require('fs-extra')
const imgSize = require('image-size')
const path = require("path")
const logger = require('./logger')

const folderContents = async (folder) => {
    const files = await fs.readdir(folder)
    if (!files.length) {
        return logger.warn('[warn] No images found');
    } else {
        logger.debug(`found files: ${files.length} in folder: ${folder}`);
    }

    let f =  files
        .filter(file => file.includes('.png'))
        .map(file => {
            return path.join(folder, file)
        });
    logger.debug(`Creating PDF file from ${f.length} images found in folder: ${folder}...`);
    return f;
}
const convert = (imgs, dest) => new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false })

    doc.pipe(fs.createWriteStream(dest))
        .on('finish', resolve)
        .on('error', reject)

    for (const img of imgs) {
        const { width, height } = imgSize(img)
        doc.addPage({ size: [width, height] }).image(img, 0, 0)
    }

    doc.end()
})

module.exports = async (sourcePath, savePath) => {
    //const savePath = path.join(process.cwd(), saveDir, courseName, 'screens');
    logger.debug('savePath for pdf:', savePath);
    // await fs.ensureDir(savePath)
    return Promise
        .resolve()
        .then(async () => await folderContents(sourcePath))
        .then(async (imgs) => {
            logger.debug('--imgs found:', imgs.length);
            if (!imgs.length) {
                logger.warn('[warn] No images found for PDF!!!');
                return Promise.resolve()
            }
            return await convert(imgs, path.resolve(savePath))
        })
    //.catch(console.error)

}//();

