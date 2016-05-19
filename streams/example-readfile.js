'use strict';

const fs = require('fs');
const path = require('path');
const async = require('async');

let latest = '20151009_194541';

// Read all files in ./incrementals folder
fs.readdir('./incrementals', (e, files) => {
  if (e) {
    console.log(`We got an error: ${e}`);
    return;
  }

  async.filterSeries(files.sort(), (file, cb) => {
    if (file === '.gitkeep') {
      return cb();
    }

    fs.readFile(path.join('incrementals', file), (err, data) => {
      if (err) {
        console.log(err);
        return;
      }

      const lines = data.toString().split('\n');

      const previous = lines[1].split(' ').pop().trim();
      if (latest && latest !== previous) {
        return cb();
      }
      latest = lines[0].split(' ').pop().trim();

      cb(null, true);
    });
  }, (err, validFiles) => {
    console.log(validFiles);  // => Prints a list of all valid files
  });
});
