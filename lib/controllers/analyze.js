const fs = require('fs');
const path = require('path');
const util = require('util');
const chalk = require('chalk');
const ora = require('ora');
const Profiler = require('truffle-compile/profiler');
const Resolver = require('truffle-resolver');
const client = require('../client');
const compiler = require('../compiler');
const report = require('../report');
const releases = require('../releases');

module.exports = async (env, args) => {
    let { ethAddress, password, apiUrl } = env;

    const modes = ['quick', 'full'];

    if (!modes.includes(args.mode)) {
        console.log('Invalid analysis mode. Available modes: ' + modes.join(', ') + '.');

        process.exit(-1);
    }

    const formats = ['text', 'stylish', 'compact', 'table', 'html', 'json'];

    if (!formats.includes(args.format)) {
        console.log('Invalid output format. Available formats: ' + formats.join(', ') + '.');

        process.exit(-1);
    }

    const solidityFilePath = path.resolve(process.cwd(), args._[0]);
    const solidityFileDir = path.dirname(solidityFilePath);

    if (!(ethAddress && password)) {
        ethAddress = '0x0000000000000000000000000000000000000000';
        password = 'trial';
    }

    const resolver = new Resolver({
        working_directory: solidityFileDir,
        contracts_build_directory: solidityFileDir
    });

    const spinner = ora({
        color: 'yellow',
        spinner: 'bouncingBar'
    });

    try {
        spinner.start('Reading input file');

        const solidityCode = fs.readFileSync(solidityFilePath, 'utf8');

        spinner.stop();

        spinner.start('Detecting solidity version');

        /* Get the version of the Solidity Compiler */
        const version = compiler.getSolidityVersion(solidityCode);

        spinner.stop();

        spinner.start(`Loading solc v${version}`);

        const { solcSnapshot, fromCache } = await compiler.loadSolcVersion(
            releases[version]
        );

        spinner.succeed(
            fromCache
                ? `Loaded solc v${version} from local cache`
                : `Downloaded solc v${version} and saved to local cache`
        );

        spinner.start('Resolving imports');

        /* Parse all the import sources and the `sourceList` */
        const resolvedSources = await Profiler.resolveAllSources(
            resolver,
            [solidityFilePath],
            solcSnapshot
        );

        const sourceList = Object.keys(resolvedSources);

        spinner.stop();

        spinner.start(
            sourceList.length === 1 ? 'Compiling source' : 'Compiling sources'
        );

        const allSources = {};

        sourceList.forEach(file => {
            allSources[file] = { content: resolvedSources[file].body };
        });

        /* Get the input config for the Solidity Compiler */
        const input = compiler.getSolcInput(allSources);

        const compiledData = compiler.getCompiledContracts(
            input,
            solcSnapshot,
            solidityFilePath,
            args._[1]
        );

        spinner.succeed(`Compiled with solc v${version} successfully`);

        spinner.start('Authenticating user');

        const mxClient = client.initialize(apiUrl, ethAddress, password);

        await client.authenticate(mxClient);

        spinner.stop();

        spinner.start('Submitting data for analysis');

        const data = client.getRequestData(
            compiledData,
            sourceList,
            solidityFilePath,
            args
        );

        if (args.debug) {
            spinner.stop();

            console.log('-------------------');
            console.log('MythX Request Body:\n');
            console.log(util.inspect(data, false, null, true));

            spinner.start();
        }

        const { uuid } = await client.submitDataForAnalysis(mxClient, data);

        spinner.succeed(
            'Analysis job with UUID ' +
            chalk.yellow(uuid) +
            ' is now in progress'
        );

        spinner.start('Analyzing ' + compiledData.contractName);

        let initialDelay;
        let timeout;

        if (args.mode === 'quick') {
            initialDelay = 20 * 1000;
            timeout = 180 * 1000;
        } else {
            initialDelay = 300 * 1000;
            timeout = 2400 * 1000;
        }

        await client.awaitAnalysisFinish(
            mxClient,
            uuid,
            initialDelay,
            timeout
        );

        spinner.stop();

        spinner.start('Retrieving analysis results');

        const issues = await client.getReport(mxClient, uuid);

        spinner.stop();

        spinner.start('Rendering output');

        /* Add all the imported contracts source code to the `data` to sourcemap the issue location */
        data.sources = { ...input.sources };

        /* Copy reference to compiled function hashes */
        data.functionHashes = compiledData.functionHashes;

        if (args.debug) {
            spinner.stop();

            console.log('-------------------');
            console.log('MythX Response Body:\n');
            console.log(util.inspect(issues, false, null, true));
            console.log('-------------------');

            spinner.start();
        }

        const uniqueIssues = report.formatIssues(data, issues);

        if (uniqueIssues.length === 0) {
            spinner.stop();

            console.log(chalk.green(`✔ No errors/warnings found in ${args._[0]} for contract: ${compiledData.contractName}`));
        } else {
            const formatter = report.getFormatter(args.format);
            const output = formatter(uniqueIssues);

            spinner.stop();

            console.log(output);
        }
    } catch (err) {
        if (spinner.isSpinning) {
            spinner.fail();
        }

        console.log(chalk.red(err));

        process.exit(1);
    }
};