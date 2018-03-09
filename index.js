var Mocha = require('mocha');
const fs = require("fs");
const path = require("path");
const rootDir = 'src';

const diff = require('diff');

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/padStart

String.prototype.padLeft = function padLeft(targetLength, padString = ' ') {
    let str = String(this);
    for (let i=0; i<targetLength; i++) {
      str = padString + str;
    }
    return str;
};


function checkSaveFile(savePath, saveContent) {
    // console.log(savePath);
    try {
        fs.accessSync(savePath);
        let savedContent = fs.readFileSync(savePath, { encoding: 'utf-8' });
        if (savedContent.length != saveContent.length || savedContent !== saveContent) {
            // const d = diff.createPatch('string', savedContent, saveContent);
            // console.log(d)

            // console.log('Saving: ' + savePath);
            fs.writeFileSync(savePath, saveContent);
        }
    }
    catch (_a) {
        fs.writeFileSync(savePath, saveContent);
    }
}
function saveResults (testData) {
    if (!testData) {
        throw new Error('Test data missing or malformed');
    }
    let savePath = path.join(process.env.JEST_ROOT_OUTPUT_PATH || rootDir, 'summary.json');
    let clone = Object.assign({}, testData);
    delete (clone.startTime);
    clone.testResults.forEach(t => delete (t.perfStats));
    let saveContent = JSON.stringify(clone, null, 2);
    
    checkSaveFile(savePath, saveContent);
    
    let imports = 'module.exports = {\n';
    let root = path.resolve(process.env.JEST_ROOT_OUTPUT_PATH || rootDir);
    // console.log(root);
    testData.testResults.forEach((suite) => {
        let suitePath = path.dirname(suite.testFilePath);
        let file = path.basename(suite.testFilePath);
        let snapshotPath = path.join(suitePath, '__snapshots__', file + '.snap');
        try {
            fs.accessSync(snapshotPath);
            // let files = fs.readdirSync(snapshotPath);
            // for (let file of files) {
            //     if (file.indexOf('.snap') >= 0) {
            //       let fullFile = path.join(snapshotPath, file);
                  let partFile = snapshotPath.replace(root, '');
                  imports += `    '${suite.testFilePath}':  require('.${partFile}'),\n`;
            //     }
            // }
        }
        catch (e) {
            // console.log(e);
            // fs.mkdirSync(snapshotPath);
        }
    });
    imports += '}';
    savePath = path.join(process.env.JEST_ROOT_OUTPUT_PATH || rootDir, 'snapshots.js');
    saveContent = imports;
    checkSaveFile(savePath, saveContent);
    return testData;
};


const {formatMochaError, colored} = require('./formatError');

const hasError = (test = {}) => {
  return test.err instanceof Error || (test.err && Object.keys(test.err).length > 0);
};
const toMochaError = test => (hasError(test) ? `\n${formatMochaError(test)}\n\n` : null);

const getFailureMessages = tests => {
  const failureMessages = tests.filter(hasError).map(toMochaError);
  return failureMessages.length ? failureMessages : null;
};

const getAncestorTitle = test => {
  if (test.parent && test.parent.title) {
    return [test.parent.title].concat(getAncestorTitle(test.parent));
  }

  return [];
};

const toTestResult = ({ stats, files, coverage }) => {
  // const effectiveTests = tests;

  // Merge failed tests that don't exist in the tests array so that we report
  // all tests even if an error occurs in a beforeEach block.
  // failures.forEach(test => {
  //   if (!tests.some(t => t === test)) {
  //     tests.push(test);
  //   }
  // });

  return {
    coverage,
    console: null,
    numFailedTests: stats.failures,
    numPassedTests: stats.passes,
    numPendingTests: stats.pending,
    // perfStats: {
    //   end: +new Date(stats.end),
    //   start: +new Date(stats.start)
    // },
    skipped: false,
    snapshot: {
      added: 0,
      fileDeleted: false,
      matched: 0,
      unchecked: 0,
      unmatched: 0,
      updated: 0
    },
    sourceMaps: {},
    testExecError: null,
    testResults: files.map(file => {
      return {
        testFilePath: file.path,
        numFailingTests: file.failures.length,
        numPassingTests: file.passes.length,
        numPendingTests: file.pending.length,
        failureMessage: getFailureMessages(file.tests),
        testResults: file.tests.map(test => {
          const failureMessage = toMochaError(test);
          return {
            ancestorTitles: getAncestorTitle(test).reverse(),
            duration: test.duration,
            failureMessages: failureMessage ? [failureMessage] : [],
            fullName: test.fullTitle(),
            numPassingAsserts: hasError(test) ? 1 : 0,
            status: hasError(test) ? 'failed' : 'passed',
            title: test.title
          };
        })
      };
    })
  };
};

class Reporter extends Mocha.reporters.Base {

  constructor(runner) {
    super(runner);

    this.parents = [];

    const files = [];

    // let tests = [];
    // let pending = [];
    // let failures = [];
    // let passes = [];

    let fileName = '';
    let file;

    runner.on('suite', test => {
      if (test.file && fileName != test.file) {
        file = {
          path: test.file,
          tests: [],
          pending: [],
          failures: [],
          passes: []
        };
        files.push(file);
        fileName = test.file;
        // console.log('Adding: ' + test.file);
      }
      
    });

    runner.on('test end', test => file.tests.push(test));

    runner.on('pass', test => {
      let l = (getAncestorTitle(test).length * 2);

      this.paintParent(test);

      console.log((colored('bright pass', '✔ Pass: ') + test.title).padLeft(l));
      // console.log(JSON.stringify(test, null, 2));
      file.passes.push(test);
    });
    runner.on('fail', (test, err) => {
      let l = (getAncestorTitle(test).length * 2) + 2;

      test.err = err;
      file.failures.push(test);

      console.log((colored('bright fail', '✘ Fail: ') + test.title).padLeft(l));
      // onsole.log(formatMochaError(test));
    });
    runner.on('pending', test => file.pending.push(test));
    runner.on('end', () => {
      let result = toTestResult({
        stats: this.stats,
        files,
        coverage: global.__coverage__
        // jestTestPath: testPath
      });

      saveResults(result);
      console.log('DONE');
      // console.log(JSON.stringify(result, null, 2));
    });
  }

  paintParent(test) {
    let parents = getAncestorTitle(test).reverse();
    for (let i=0; i<parents.length; i++) {
      if (parents[i] != this.parents[i]) {
        if (i==0) {
          console.log();
        }
        console.log(parents[i].padLeft(i*2));
      }
    }
    this.parents = parents;

  }
}

function ExportedReporter(runner) {
  return new Reporter(runner);
}

module.exports = ExportedReporter;
