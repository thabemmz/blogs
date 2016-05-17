# Processing large files with Node Streams

A client of ours has a big Postgresql database that needs to be updated each day. These updates take place via incremental SQL files, provided on a daily basis. The incremental files are placed in a specific folder on the server. Our task is to apply these incremental files in sequence.

## The incremental files
Each incremental file starts with the following comments:

```
-- Increment timestamp: 20160129_192339
-- Previous timestamp: 20160128_192500
```

Before we start applying these incremental files, we'd like to validate whether the previous timestamp of the first processed file matches the timestamp that's stored in the database. After that, we'd like to validate that the timestamps of all incremental files match with each other. We handle this validation-process with our existing Node-application.

## Initial approach
Our initial approach of handling this is by reading all files in the `incrementals` folder. Since filenames contain a date, sorting the files alphabetically within the folder gives us all available incremental files in order. For each file, we read it, abstract the increment and previous timestamps and validate whether the timestamps are in sequence.

The (simplified) code for doing this:
```js
const fs = require('fs');
const async = require('async');
const path = require('path');

let latest = '20160128_192500';
let validFiles = [];

// Read all files in ./incrementals folder
fs.readdir('./incrementals', (e, files) => {
  async.eachSeries(files.sort(), (file, cb) => {
    fs.readFile(path.join('incrementals', file), (err, data) => {
      const lines = data.toString().split('\r\n');

      let previous = lines[1].split(' ').pop();
      if (latest && latest !== previous) {
        cb();
        return;
      }
      latest = lines[0].split(' ').pop();
      validFiles.push(file);

      cb();
    });
  }, () => {
    console.log(validFiles);  // => Prints a list of all valid files
  });
});
```

We process each file in the `incrementals` folder in order by using [Async](https://github.com/caolan/async). Async is a module that helps you to deal with asynchronous challenges within Node. The `async.eachSeries` function we use here makes sure a function is applied to each item of the provided collection, but it only runs a single operation at a time. This makes sure all files are validated in order. This is necessary because we can have two sequential inremental files within the `incrementals` folder.

Each file is split in lines. The first line should be `-- Increment timestamp: 20160129_192339`, the second line should be `-- Previous timestamp: 20160128_192500`. By splitting each line on space and only using the last element of each line, we have the timestamps and we can compare them to other timestamps available.

So far, so good...

## Drawbacks of this approach
Though the code above works out fine for small files, it will result in errors for larger incremental files. Since we had to handle incremental files of about 200MB big, we soon ran into errors:

```
buffer.js:388
    throw new Error('toString failed');
    ^
```

This unclear error means the generated String takes up more memory than allowed (see [this issue for more information](https://github.com/nodejs/node/issues/3175)).

When you think about this, it makes sense: when reading the file, the full contents of the file are stored in a buffer, which is cast to a string, which is turned into a large array of separate lines. That's a very memory-intensive process, only to retrieve the first two lines of a file...

Let's find a better solution for this.

## Better approach
Node is asynchronous in handling I/O-bound tasks. Callbacks are often used for handling these asynchronous tasks, but Node has another way of handling this: [Streams](https://nodejs.org/api/stream.html). Streams come from Unix, where you might know them from using the `|` (pipe) in your shell. You are able to pipe data through multiple stages to its final destination, where each stage can transform the data. There are some excellent articles [written](https://github.com/substack/stream-handbook) [about](http://maxogden.com/node-streams.html) [Streams](https://www.sitepoint.com/basics-node-js-streams/) in Node.

Node's `fs` module has a method `createReadStream`, to create a stream from a file. This stream does not buffer the entire contents of the file, but it emits an event as soon as a chunk of data is available. This is useful for us, since we'd only like to process the first two lines of a file and ignore the rest.

The streams approach of our code would be:
```js
const fs = require('fs');
const async = require('async');
const path = require('path');
const highland = require('highland');

let latest = '20160128_192500';
let validFiles = [];

// Read all files in ./incrementals folder
fs.readdir('./incrementals', (e, files) => {
  async.eachSeries(files.sort(), (file, cb) => {
    const fileStream = fs.createReadStream(path.join('incrementals', file));

    highland(fileStream)
      .split()  // split file in lines
      .take(2)  // only the first two lines are interesting for us
      .toArray((lines) => {
        const previous = lines[1].split(' ').pop();

        if (latest && latest !== previous) {
          cb();
          return;
        }

        latest = lines[0].split(' ').pop();
        validFiles.push(file);

        cb();
      });
  }, () => {
    console.log(validFiles);  // => Prints a list of all valid files
  });
});
```

The thing that has changed is how a single file is processed. Instead of using `fs.readFile`, we now generate a filestream with `fs.createReadStream`. We pass this stream to [Highland](http://highlandjs.org/). Highland is a library that provides useful functions for handling streams and for transforming and iterating data on streams.

Highland transforms the contents of the incremental file as follows:
- [`split()`](http://highlandjs.org/#split) splits the file by line. Each line that is abstracted is being put on the stream again.
- [`take(2)`](http://highlandjs.org/#take) creates a new stream with 2 elements: the first two lines of the increment file
- [`toArray()`](http://highlandjs.org/#toArray) casts this stream to an Array so we can work with it in its callback function

Since Highland uses [lazy evaluation](http://highlandjs.org/#laziness), it pauses the stream after having processed the first two lines, meaning the rest of the lines in the file won't be processed. However, since we paused the stream, we could resume the filestream at any given time to do something with other contents in the file.

With this approach it doesn't matter how large the files are, since only the first part of the file will be looked at. Highland provides a good layer of abstraction and makes our code more readable.

## Conclusions
From this small excersize we learn that streams in Node are not just the solution for processing large files, but they also optimize processing smaller files, since they only do what is absolutely necessary. Streams also improve your way of handling how a file is read. We can pause and resume reading the file at any given time. And with a library like Highland we also improve the readability of our code.

We couldn't agree more with [@dominictarr](https://twitter.com/dominictarr) in his [High level style in javascript](https://gist.github.com/dominictarr/2401787): "streams in node are one of the rare occasions when doing something the fast way is actually easier. SO USE THEM."
