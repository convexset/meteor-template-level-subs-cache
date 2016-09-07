/* global Meteor: true */
/* global Template: true */
/* global Spacebars: true */

/* global InformationBundler: true */
/* global TemplateLevelSubsCache: true */

import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';
checkNpmVersions({
	'package-utils': '^0.2.1',
	'underscore': '^1.8.3',
});
const PackageUtilities = require('package-utils');
const _ = require('underscore');

function countKeys(o) {
	return _.reduce(o, acc => acc + 1, 0);
}

const INFORMATION_BUNDLER_NAMESPACE = "[[[convexset:template-level-subs-cache/information-bundler]]]";

if (Meteor.isClient) {
	Template.registerHelper('_ib_', function(helperName, ...args) {
		const instance = Template.instance();
		if (instance[INFORMATION_BUNDLER_NAMESPACE]) {
			while (args[args.length - 1] instanceof Spacebars.kw) {
				args.pop();
			}
			const helper = instance[INFORMATION_BUNDLER_NAMESPACE].helpersAvailable[helperName];
			if (typeof helper !== 'undefined') {
				if (_.isFunction(helper)) {
					return helper.apply(this, args);
				} else {
					return helper;
				}
			} else {
				throw new Meteor.Error('information-bundler-error--helper-not-available', helperName);
			}
		} else {
			throw new Meteor.Error('information-bundler-not-applied', instance.view.name);
		}
	});
}

InformationBundler = (function() {
	var __ib = function InformationBundler() {};
	var _ib = new __ib();

	// Debug Mode
	var _debugMode = false;
	PackageUtilities.addPropertyGetterAndSetter(_ib, "DEBUG_MODE", {
		get: () => _debugMode,
		set: (value) => {
			_debugMode = !!value;
		},
	});

	// Logger
	var _logger = function defaultInfoLogger() {
		console.info.apply(console, _.toArray(arguments));
	};
	PackageUtilities.addPropertyGetterAndSetter(_ib, "LOG", {
		get: () => _logger,
		set: (fn) => {
			if (_.isFunction(fn)) {
				_logger = fn;
			}
		},
	});

	/////////////////////////////////////////////////////////////////////////////
	// Information Bundles
	/////////////////////////////////////////////////////////////////////////////
	var infoBundles = {};
	var suppBundles = [];
	var globalHelperPool = {};
	PackageUtilities.addImmutablePropertyFunction(_ib, "addBasicInformationBundle", function addBasicInformationBundle({
		bundleName, helpers = {}, knownExtension = false
	} = {}) {
		if (!_.isObject(helpers)) {
			throw new Meteor.Error("invalid-helpers", "helpers should be an object.");
		}

		if (_debugMode) {
			_ib.LOG(`[TLSC|InformationBundler|addBasicInformationBundle] Adding bundle ${bundleName} with ${countKeys(helpers)} helpers.`);
		}

		if (!!infoBundles[bundleName]) {
			if (!knownExtension) {
				_ib.LOG(`Information bundle ${bundleName} already exists. Augmenting (and overwriting) existing where necessary...`);
			}
			_.extend(infoBundles[bundleName], helpers);
		} else {
			infoBundles[bundleName] = helpers;
		}

		_.forEach(helpers, function(h, helperName) {
			if (!!globalHelperPool[helperName] && (globalHelperPool[helperName] !== h)) {
				_ib.LOG(`Helper with name ${helperName} already exists. Using helper from ${bundleName} to overwrite existing...`);
			}
			globalHelperPool[helperName] = h;
		});
	});

	function checkBundleNames(bundleNames) {
		bundleNames.forEach(function(name) {
			if (!infoBundles[name]) {
				throw new Meteor.Error("undeclared-info-bundle-name", `Undeclared information bundle name: ${name}`);
			}
		});
	}

	PackageUtilities.addImmutablePropertyFunction(_ib, "addSupplementaryInformationBundle", function addSupplementaryInformationBundle({
		bundleNames = [], helpers = {}
	} = {}) {
		if (!_.isObject(helpers)) {
			throw new Meteor.Error("invalid-helpers", "helpers should be an object.");
		}
		if (!_.isArray(bundleNames)) {
			throw new Meteor.Error("invalid-bundle-names", "bundleNames should be an array (of strings).");
		}
		checkBundleNames(bundleNames);

		if (_debugMode) {
			_ib.LOG(`[TLSC|InformationBundler|addSupplementaryInformationBundle] Adding supplementary bundle [${bundleNames}] with ${countKeys(helpers)} helpers.`);
		}

		suppBundles.push({
			bundleNames: bundleNames,
			helpers: helpers
		});

		_.forEach(helpers, function(h, helperName) {
			if (!!globalHelperPool[helperName]) {
				_ib.LOG(`Helper with name ${helperName} already exists. Using helper from [${bundleNames}] to overwrite existing...`);
			}
			globalHelperPool[helperName] = h;
		});
	});

	PackageUtilities.addImmutablePropertyFunction(_ib, "addGeneralInformationBundle", function addGeneralInformationBundle(helpers = {}) {
		return _ib.addSupplementaryInformationBundle({
			bundleNames: [],
			helpers: helpers
		});
	});

	PackageUtilities.addImmutablePropertyFunction(_ib, "getHelper", function getHelper(helperName) {
		return globalHelperPool[helperName];
	});


	/////////////////////////////////////////////////////////////////////////////
	// Associated Subscriptions
	/////////////////////////////////////////////////////////////////////////////
	function arr1ContainsArr2(pool, candidateArray) {
		for (let i = 0; i < candidateArray.length; i++) {
			if (pool.indexOf(candidateArray[i]) === -1) {
				return false;
			}
		}
		return true;
	}

	if (Meteor.isClient) {
		var subAssociations = {};
		var subNames = [];
		PackageUtilities.addImmutablePropertyFunction(_ib, "associateSubscription", function associateSubscription({
			bundleName,
			subName,
			subscriptionArgs,
			options = {}
		} = {}) {
			if (!infoBundles[bundleName]) {
				throw new Meteor.Error("undeclared-info-bundle-name", `Undeclared information bundle name: ${bundleName}`);
			}
			if (subNames.indexOf(subName) !== -1) {
				throw new Meteor.Error("repeated-sub-name", `Repeated subscription name: ${subName}`);
			}
			if (!subAssociations[bundleName]) {
				subAssociations[bundleName] = [];
			}

			if (_debugMode) {
				_ib.LOG(`[TLSC|InformationBundler|associateSubscription] Associating sub with name ${subName} with bundle ${bundleName}...`);
			}

			subAssociations[bundleName].push({
				name: subName,
				subscriptionArgs: subscriptionArgs,
				options: options
			});
		});

		PackageUtilities.addImmutablePropertyFunction(_ib, "subscriptionsUsed", function subscriptionsUsed(bundleNames = []) {
			checkBundleNames(bundleNames);
			var result = [];
			bundleNames.forEach(function(bname) {
				// get all the relevant subs
				if (!!subAssociations[bname]) {
					subAssociations[bname].forEach(function(item) {
						if (_debugMode) {
							var isProbablyReactive = item.subscriptionArgs.filter(x => _.isFunction(x)).length > 0;
							_ib.LOG(`[TLSC|InformationBundler] ${bname} (of [${bundleNames}]) uses subscription ${item.name}${isProbablyReactive ? " (probably reactive)": ""}`);
						}
						result.push(item);
					});
				}
			});
			return result;
		});

		PackageUtilities.addImmutablePropertyFunction(_ib, "helpersUsed", function helpersUsed(bundleNames = []) {
			checkBundleNames(bundleNames);
			var result = {};

			bundleNames.forEach(function(bname) {
				// add the "basic" information bundles
				if (_debugMode) {
					_ib.LOG(`[TLSC|InformationBundler] There are ${countKeys(infoBundles[bname])} helpers in ${bname} (basic bundle)`);
				}
				_.forEach(infoBundles[bname], function(helper, helperName) {
					result[helperName] = helper;
				});
			});

			suppBundles.forEach(function(suppBundle) {
				// add helpers if bundleNames contains everything in suppBundle.bundleNames
				if (arr1ContainsArr2(bundleNames, suppBundle.bundleNames)) {
					if (_debugMode) {
						_ib.LOG(`[TLSC|InformationBundler] There are ${countKeys(suppBundle.helpers)} helpers in supplementary bundle requiring [${suppBundle.bundleNames}]`);
					}
					_.forEach(suppBundle.helpers, function(helper, helperName) {
						result[helperName] = helper;
					});
				}
			});

			if (_debugMode) {
				_ib.LOG(`[TLSC|InformationBundler] ${countKeys(result)} helpers implied by [${bundleNames}]: ${_.map(result, (h,k) => k).join(", ")}`);
			}

			return result;
		});

		PackageUtilities.addImmutablePropertyFunction(_ib, "prepareTemplates", function prepareTemplates({
			cache = TemplateLevelSubsCache.DEFAULT_CACHE,
			templates = [],
			bundleNames = []
		}) {
			checkBundleNames(bundleNames);
			if (!_.isArray(templates)) {
				templates = [templates];
			}

			templates.forEach(function(tmpl) {
				if (_debugMode) {
					_ib.LOG(`[TLSC|InformationBundler|prepareTemplates] Applying [${bundleNames}] to ${tmpl.viewName}`);
				}

				// register use of bundles
				tmpl.onCreated(function bundleInheritance() {
					if (_debugMode) {
						_ib.LOG(`[TLSC|InformationBundler|bundleInheritance] For ${tmpl.viewName}`);
					}
					const instance = this;
					if (!instance[INFORMATION_BUNDLER_NAMESPACE]) {
						instance[INFORMATION_BUNDLER_NAMESPACE] = {};
					}
					if (!instance[INFORMATION_BUNDLER_NAMESPACE].bundlesAvailable) {
						instance[INFORMATION_BUNDLER_NAMESPACE].bundlesAvailable = bundleNames.map(x => x);
					}
					const registeredBundlesAvailable = instance[INFORMATION_BUNDLER_NAMESPACE].bundlesAvailable;

					const parentInfo = (instance.parent() || {})[INFORMATION_BUNDLER_NAMESPACE];
					if (!!parentInfo) {
						const parentBundles = parentInfo.bundlesAvailable;
						if (_debugMode) {
							_ib.LOG('[TLSC|InformationBundler|bundleInheritance] Parent found with bundles', parentBundles);
						}
						parentBundles.forEach(b => {
							if (registeredBundlesAvailable.indexOf(b) === -1) {
								registeredBundlesAvailable.push(b);
							}
						});
						if (_debugMode) {
							_ib.LOG('[TLSC|InformationBundler|bundleInheritance] Post Inheritance. All bundles used:', registeredBundlesAvailable);
						}
					} else {
						if (_debugMode) {
							_ib.LOG('[TLSC|InformationBundler|bundleInheritance] No InformationBundler-enabled parent available.');
						}
					}

					instance[INFORMATION_BUNDLER_NAMESPACE].helpersAvailable = _ib.helpersUsed(registeredBundlesAvailable);
					if (_debugMode) {
						_ib.LOG(`[TLSC|InformationBundler] Helpers available to instance of ${tmpl.viewName}: [${Object.keys(instance[INFORMATION_BUNDLER_NAMESPACE].helpersAvailable)}]`);
					}
				});

				// prepare templates with all relevant subs
				_ib.subscriptionsUsed(bundleNames).forEach(function({
					name, subscriptionArgs, options
				}) {
					var TLSC_debugMode = TemplateLevelSubsCache.DEBUG_MODE;
					if (_debugMode) {
						TemplateLevelSubsCache.DEBUG_MODE = true;
					}
					if (_debugMode) {
						_ib.LOG(`[TLSC|InformationBundler|prepareTemplates] Adding subscription ${name} to ${tmpl.viewName}`);
					}
					cache.prepareCachedSubscription(tmpl, name, subscriptionArgs, options);
					TemplateLevelSubsCache.DEBUG_MODE = TLSC_debugMode;
				});

				// prepare templates with all relevant helpers
				var allHelpers = _ib.helpersUsed(bundleNames);
				if (_debugMode) {
					_ib.LOG(`[TLSC|InformationBundler|prepareTemplates] Adding ${countKeys(allHelpers)} helpers to ${tmpl.viewName}`);
				}
				tmpl.helpers(allHelpers);
			});
		});

		PackageUtilities.addImmutablePropertyFunction(_ib, 'touch', function touch(tmpl) {
			_ib.prepareTemplates({
				templates: tmpl,
				bundleNames: []
			});
		});
	}
	/////////////////////////////////////////////////////////////////////////////

	return _ib;
})();
