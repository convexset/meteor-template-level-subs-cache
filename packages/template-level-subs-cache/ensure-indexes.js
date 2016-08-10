/* global _EnsureIndexes: true */

// This is provides server only functionality

import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';
checkNpmVersions({
	'package-utils': '^0.2.1',
	'underscore': '^1.8.3',
});
const PackageUtilities = require('package-utils');
const _ = require('underscore');

var Future = Npm.require('fibers/future');
Mongo.Collection.prototype.getIndexes = function() {
	var raw = this.rawCollection();
	var future = new Future();

	raw.indexes(function(err, indexes) {
		if (err) {
			future.throw(err);
		} else {
			future.return(indexes);
		}
	});

	return future.wait();
};

_EnsureIndexes = (function() {
	var _ei = function EnsureIndexes() {};
	var ei = new _ei();

	var indexes = {};
	PackageUtilities.addImmutablePropertyFunction(ei, 'addIndex', function addIndex(collectionName, indexEntry, options = {}) {
		if (collectionName instanceof Mongo.Collection) {
			collectionName = collectionName._name;
		}

		if (typeof indexes[collectionName] === "undefined") {
			indexes[collectionName] = [];
		}
		var item = {
			indexEntry: indexEntry,
		};
		if (Object.keys(options).length > 0) {
			item.options = options;
		}
		indexes[collectionName].push(item);

		Mongo.Collection.get(collectionName)._ensureIndex(_.object(indexEntry), options);
	});

	PackageUtilities.addImmutablePropertyFunction(ei, 'list', function list() {
		_.forEach(indexes, function(items, collectionName) {
			if (items.length > 0) {
				items.forEach(function(entry) {
					console.log('db.' + collectionName + '.createIndex({' + (entry.indexEntry.map(x => "\"" + x[0] + "\": " + x[1]).join(', ') + `}, ${EJSON.stringify(entry.options)});`));
				});
			}
		});
	});

	PackageUtilities.addImmutablePropertyFunction(ei, 'listExtraIndexes', function listExtraIndexes(nsToIgnore = ["meteor.users"]) {
		// Hide stuff if collection was not mentioned to addIndex
		// Mongo.Collection.getAll().forEach(function(collectionInfo) {
		// 	if (!!collectionInfo.instance._connection && !indexes[collectionInfo.name]) {
		// 		indexes[collectionInfo.name] = [];
		// 	}
		// });
		_.forEach(indexes, function(items, collectionName) {
			var allEnsuredIndexes = (items.concat([
				{
					indexEntry: [
						['_id', 1]
					]
				}
			])).map(function(x) {
				return EJSON.stringify(x, {
					canonical: true
				});
			});
			var _allCurrentIndexes;
			try {
				// this can fail when there is no such collection
				_allCurrentIndexes = Mongo.Collection.get(collectionName).getIndexes();
			} catch (e) {
				console.error(`Error getting indexes in collection: ${collectionName}:`, e);
				return;
			}

			var allCurrentIndexesDict = _.object(_allCurrentIndexes.map(function(x) {
				var item = {
					indexEntry: _.map(x.key, (v, k) => [k, v]),
				};

				var info = {
					name: x.name,
					ns: x.ns,
					v: x.v,
					key: x.key
				};
				_.forEach(x, function(v, k) {
					if (["key", "name", "ns", "v"].indexOf(k) === -1) {
						if (!info.options) {
							info.options = {};
							item.options = {};
						}
						info.options[k] = v;
						item.options[k] = v;
					}
				});
				return [EJSON.stringify(item, {
					canonical: true
				}), info];
			}));
			var allCurrentIndexes = _.map(allCurrentIndexesDict, function(info) {
				var item = {
					indexEntry: _.map(info.key, (v, k) => [k, v]),
				};
				if (Object.keys(info.options || {}).length > 0) {
					item.options = info.options;
				}
				return EJSON.stringify(item, {
					canonical: true
				});
			});

			var extraIndexes = allCurrentIndexes.filter(x => allEnsuredIndexes.indexOf(x) === -1);
			extraIndexes.forEach(function(key) {
				if (nsToIgnore.indexOf(allCurrentIndexesDict[key].ns) === -1) {
					var removeCmd = 'db.' + collectionName + '.dropIndex(' + EJSON.stringify(allCurrentIndexesDict[key].key) + ')';
					console.log('ns: ' + allCurrentIndexesDict[key].ns + '; v: ' + allCurrentIndexesDict[key].v + '; name: ' + allCurrentIndexesDict[key].name + '; key: ' + EJSON.stringify(allCurrentIndexesDict[key].key));
					if (!!allCurrentIndexesDict[key].options) {
						console.log('\toptions: ' + JSON.stringify(allCurrentIndexesDict[key].options));
					}
					console.log(' - ' + removeCmd);
				}
			});
		});
	});

	return ei;
})();