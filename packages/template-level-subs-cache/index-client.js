import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';
checkNpmVersions({
	'package-utils': '^0.2.1',
	'underscore': '^1.8.3',
});

import { Template } from 'meteor/templating';
import { Spacebars } from 'meteor/spacebars';
import { ReactiveDict } from 'meteor/reactive-dict';

import { TemplateLevelSubsCache } from './client/template-level-subs-cache.js';

import { DefaultSubscriptions } from './client/default-subscriptions.js';

import { prepareInformationBundler } from './information-bundler.js';
const InformationBundler = prepareInformationBundler({Template, Spacebars, ReactiveDict, TemplateLevelSubsCache});

export { TemplateLevelSubsCache, DefaultSubscriptions, InformationBundler };
