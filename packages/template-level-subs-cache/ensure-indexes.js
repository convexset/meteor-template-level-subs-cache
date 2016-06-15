/* global _EnsureIndexes: true */

import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';
checkNpmVersions({
  'package-utils': '^0.2.1'
});
const PackageUtilities = require('package-utils');

if (Meteor.isServer) {
	var Future = Npm.require('fibers/future');
	Mongo.Collection.prototype.getIndexes = function() {
		var raw = this.rawCollection();
		var future = new Future();

		raw.indexes(function(err, indexes) {
			if (err) {
				future.throw(err);
			}

			future.return(indexes);
		});

		return future.wait();
	};
}

_EnsureIndexes = (function() {
	var _ei = function EnsureIndexes() {};
	var ei = new _ei();

	var indexes = {};
	PackageUtilities.addImmutablePropertyFunction(ei, 'addIndex', function addIndex(collectionName, indexEntry) {
		if (collectionName instanceof Mongo.Collection) {
			collectionName = collectionName._name;
		}

		if (typeof indexes[collectionName] === "undefined") {
			indexes[collectionName] = [];
		}
		indexes[collectionName].push(indexEntry);

		if (Meteor.isServer) {
			Mongo.Collection.get(collectionName)._ensureIndex(_.object(indexEntry));
		}
	});

	if (Meteor.isServer) {
		PackageUtilities.addImmutablePropertyFunction(ei, 'list', function list() {
			_.forEach(indexes, function(items, collectionName) {
				if (items.length > 0) {
					items.forEach(function(entry) {
						console.log('db.' + collectionName + '.createIndex({' + (entry.map(x => "\"" + x[0] + "\": " + x[1]).join(', ') + '});'));
					});
				}
			});
		});

		PackageUtilities.addImmutablePropertyFunction(ei, 'listExtraIndexes', function listExtraIndexes(nsToIgnore = ["meteor.users"]) {
			Mongo.Collection.getAll().forEach(function(collectionInfo) {
				if (!!collectionInfo.instance._connection && !indexes[collectionInfo.name]) {
					indexes[collectionInfo.name] = [];
				}
			});
			_.forEach(indexes, function(items, collectionName) {
				var allEnsuredIndexes = (items.concat([
					[
						['_id', 1]
					]
				])).map(x => JSON.stringify(_.object(x)));
				var _allCurrentIndexes = Mongo.Collection.get(collectionName).getIndexes();
				var allCurrentIndexes = _allCurrentIndexes.map(x => JSON.stringify(x.key));
				var allCurrentIndexesDict = _.object(_allCurrentIndexes.map(x => [JSON.stringify(x.key), {
					name: x.name,
					ns: x.ns,
					v: x.v
				}]));
				var extraIndexes = allCurrentIndexes.filter(x => allEnsuredIndexes.indexOf(x) === -1);
				extraIndexes.forEach(function(key) {
					if (nsToIgnore.indexOf(allCurrentIndexesDict[key].ns) === -1) {
						var removeCmd = 'db.' + collectionName + '.dropIndex(' + key + ')';
						console.log('ns: ' + allCurrentIndexesDict[key].ns + '; v: ' + allCurrentIndexesDict[key].v + '; name: ' + allCurrentIndexesDict[key].name + '; key: ' + key + '\n - ' + removeCmd);
					}
				});
			});
		});
	}

	return ei;
})();