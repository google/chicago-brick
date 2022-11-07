const fs = require('fs');
const path = require('path');

const rawDirPath = path.join(__dirname, 'raw');
const allDoodlesPath = path.join(__dirname, 'doodles.all.json');

const allDoodles = fs
  .readdirSync(rawDirPath)
  .reduce((_allDoodles, fileName) => {
    const filePath = path.join(rawDirPath, fileName);

    let fileDoodles = [];

    try {
      fileDoodles = JSON.parse(fs.readFileSync(filePath));
    } catch (_err) {
      console.error('Improper JSON:', filePath);
    }

    return _allDoodles.concat(fileDoodles);
  }, []);

fs.writeFileSync(allDoodlesPath, JSON.stringify(allDoodles));
