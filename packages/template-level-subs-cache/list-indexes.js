/* global PackageUtilities: true */
/* global _ListIndexes: true */

_ListIndexes = (function() {
	var _li = function ListIndexes() {};
	var li = new _li();

	var indexes = {};
	PackageUtilities.addImmutablePropertyFunction(li, 'addIndex', function addIndex(collectionName, indexEntry) {
		if (typeof indexes[collectionName] === "undefined") {
			indexes[collectionName] = [];
		}
		indexes[collectionName].push(indexEntry);
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
	}

	return li;
})();