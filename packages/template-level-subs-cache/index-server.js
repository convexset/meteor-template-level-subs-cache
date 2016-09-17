import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';
checkNpmVersions({
	'package-utils': '^0.2.1',
	'underscore': '^1.8.3',
});

import { prepareDefaultSubscriptions } from './prepare-default-subscriptions.js';
const DefaultSubscriptions = prepareDefaultSubscriptions();

import { prepareInformationBundler } from './information-bundler.js';
const InformationBundler = prepareInformationBundler();

import { _EnsureIndexes } from './server/ensure-indexes.js';

export { DefaultSubscriptions, InformationBundler, _EnsureIndexes };
