const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

function zipFolder (sourceDir, outputFile) {
    const zip = new AdmZip();
    zip.addLocalFolder(sourceDir);
    zip.writeZip(outputFile);
    console.log(`Created ${outputFile}`);
}

function zipFolders (sourceDirs, outputFiles) {
    if (sourceDirs.length !== outputFiles.length) {
        throw new Error('Source and output directories must be the same length');
    }

    for (let i = 0; i < sourceDirs.length; i++) {
        zipFolder(sourceDirs[i], outputFiles[i]);
    }
}

function cleanDir (directoryPath) {
    // Check if the directory exists and it's a directory.
    if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
        throw new Error(`Not a valid directory: ${directoryPath}`);
    }

    const files = fs.readdirSync(directoryPath);
    for (const file of files) {
        const filePath = path.join(directoryPath, file);
        fs.unlinkSync(filePath);
    }
}

function cleanDirs (directoryPaths) {
    for (const directoryPath of directoryPaths) {
        if (fs.existsSync(directoryPath)) {
            const files = fs.readdirSync(directoryPath);
            const fileGroups = {};

            for (const file of files) {
                const ext = path.extname(file) || 'no extension';
                if (!fileGroups[ext]) {
                    fileGroups[ext] = 0;
                }
                fileGroups[ext] += 1;

                const filePath = path.join(directoryPath, file);
                fs.unlinkSync(filePath);
            }

            console.log(`Cleaned files from: ${directoryPath}`);
            for (const [ext, count] of Object.entries(fileGroups)) {
                console.log(` - ${count} file(s) with ${ext === 'no extension' ? 'no extension' : `${ext} extension`}`);
            }
        }
    }
}
module.exports = {
    zipFolder,
    zipFolders,
    cleanDir,
    cleanDirs,
};
