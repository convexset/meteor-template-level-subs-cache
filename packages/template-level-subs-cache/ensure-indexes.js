/* global PackageUtilities: true */
/* global _EnsureIndexes: true */

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
	var _li = function ListIndexes() {};
	var li = new _li();

	var indexes = {};
	PackageUtilities.addImmutablePropertyFunction(li, 'addIndex', function addIndex(collectionName, indexEntry) {
		if (collectionName instanceof Mongo.Collection) {
			collectionName = collection._name;
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
		PackageUtilities.addImmutablePropertyFunction(li, 'list', function list() {
			_.forEach(indexes, function(items, collectionName) {
				if (items.length > 0) {
					items.forEach(function(entry) {
						console.log('db.' + collectionName + '.createIndex({' + (entry.map(x => "\"" + x[0] + "\": " + x[1]).join(', ') + '});'));
					});
				}
			});
		});

		PackageUtilities.addImmutablePropertyFunction(li, 'listExtraIndexes', function listExtraIndexes() {
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
					console.log('ns: ' + allCurrentIndexesDict[key].ns + '; v: ' + allCurrentIndexesDict[key].v + '; name: ' + allCurrentIndexesDict[key].name + '; key: ' + key);
				});
			});
		});
	}

	return li;
})();