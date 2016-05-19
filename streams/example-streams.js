'use strict';

const fs = require('fs');
const path = require('path');
const async = require('async');
const highland = require('highland');

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

    const fileStream = fs.createReadStream(path.join('incrementals', file));

    // Inserted these listeners to check Highland behavior
    // fileStream.on('readable', () => {
    //   console.log('There is a new datachunk!');
    //   fileStream.resume();
    // });
    //
    // fileStream.on('data', (chunk) => {
    //   console.log('I just received data');
    //   console.log(chunk.toString());
    // });

    highland(fileStream)
      .split()  // split file in lines
      .take(2)  // only the first two lines are interesting for us
      .toArray((lines) => {
        const previous = lines[1].split(' ').pop();

        if (latest && latest !== previous) {
          return cb();
        }

        latest = lines[0].split(' ').pop();

        cb(null, true);
      });
  }, (err, validFiles) => {
    console.log(validFiles);  // => Prints a list of all valid files
  });
});
