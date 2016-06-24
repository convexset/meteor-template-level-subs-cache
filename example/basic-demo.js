/* global Fake: true */
/* global Boo: true */
/* global Hoo: true */
/* global BooMirror: true */
/* global HooMirror: true */
/* global idx1: true */
/* global TemplateLevelSubsCache: true */
/* global Template: true */
/* global hello2: true */

Boo = new Mongo.Collection("boo");
Hoo = new Mongo.Collection("hoo");
BooMirror = new Mongo.Collection("boo-mirror");
HooMirror = new Mongo.Collection("hoo-mirror");
idx1 = new ReactiveVar(0);

if (Meteor.isServer) {
	Mongo.Collection.get("boo")._ensureIndex({
		should: 1,
		not: -1,
		be: 1,
		here: 1
	});
	Mongo.Collection.get("hoo")._ensureIndex({
		also: 1,
		should: -1,
		not: -1,
		be: 1,
		here: 1
	});

	//////////////////////////////////////////////////////////////////////
	// Create data set
	//////////////////////////////////////////////////////////////////////
	Meteor.startup(function() {
		Boo.remove({});
		Hoo.remove({});
		BooMirror.remove({});
		HooMirror.remove({});
		_.range(10).forEach(function(idx1) {
			var items = _.range(2 + Math.floor(5 * Math.random())).map(() => Fake.word());
			var entry = {
				idx1: idx1,
				content: items.join(", "),
			};
			Boo.insert(entry);
			BooMirror.insert(entry);
			items.forEach(function(item, idx2) {
				var entry = {
					idx1: idx1,
					idx2: idx2,
					item: item,
				};
				Hoo.insert(entry);
				HooMirror.insert(entry);
			});
		});
	});

	//////////////////////////////////////////////////////////////////////
	// Publish the data
	//////////////////////////////////////////////////////////////////////
	Meteor.publish('boo-step-1', function(idx1) {
		return Boo.find({
			idx1: idx1
		});
	});

	Meteor.publish('hoo-step-2', function(indices) {
		return Hoo.find({
			idx1: {
				$in: indices
			}
		});
	});

	//////////////////////////////////////////////////////////////////////
	// Publish a "copy" of the data
	//////////////////////////////////////////////////////////////////////
	Meteor.publish('all', function() {
		return [
			BooMirror.find(),
			HooMirror.find(),
		];
	});
}

if (Meteor.isClient) {
	//////////////////////////////////////////////////////////////////////
	// Subscribe to the "copy" of the data (to display "for reference")
	//////////////////////////////////////////////////////////////////////
	Template.hello1.onCreated(function() {
		this.subscribe('all');
	});

	//////////////////////////////////////////////////////////////////////
	// Show Values of idx1 Available in the First Collection via the
	// first subscription for use as a parameter in the second subscription
	//////////////////////////////////////////////////////////////////////
	var hooArg = function hooArg() {
		var indices = Boo.find().map(x => x.idx1);
		console.log('[Sub Step 2|Args] Indices in Boo: [' + indices.join(', ') + ']');
		return indices;
	};
	Tracker.autorun(function() {
		var indices = Boo.find().map(x => x.idx1);
		console.log('[Autorun] Indices in Boo: [' + indices.join(', ') + ']');
		return indices;
	});

	//////////////////////////////////////////////////////////////////////
	// The TemplateLevelSubsCache code proper
	//////////////////////////////////////////////////////////////////////

	// Turn debug mode on to spam the console with lifecycle status updates
	TemplateLevelSubsCache.DEBUG_MODE = true;

	// Make a cache where stuff is removed two seconds after a sub is stopped
	var TLSC = TemplateLevelSubsCache.makeCache({
		expireAfter: 0.0166667 * 2,
	});

	// Create the "step 1" sub
	// Keep stuff for 5 sec after stopping
	TLSC.prepareCachedSubscription(Template.hello2, 'boo-step-1', ['boo-step-1',
		function() {
			var thisIdx = idx1.get();
			console.log('[Sub Step 1|Args] idx1: ' + thisIdx);
			return thisIdx;
		}
	], {
		expireAfter: 0.0166667 * 5,
	});

	// Create the "step 2" sub
	TLSC.prepareCachedSubscription(
		Template.hello2,
		'hoo-step-2', ['hoo-step-2', hooArg], {
			startOnCreated: false
		}
	);

	// Expose the template instance
	Template.hello2.onCreated(function() {
		hello2 = this;
	});

	// Some onReady notifications for individual subs and all subs
	Template.hello2.onRendered(function() {
		var instance = this;

		['boo-step-1', 'hoo-step-2'].forEach(function(subId) {
			Tracker.autorun(function() {
				if (instance.cachedSubscription.cachedSubReady(subId)) {
					console.log('~~~~~~ [hello2] ' + subId + ' ready ~~~~~~');
				} else {
					console.log('~~~~~~ [hello2] ' + subId + ' not ready yet ~~~~~~');
				}
			});
		});

		Tracker.autorun(function() {
			if (instance.cachedSubscription.allSubsReady()) {
				console.log('====== [hello2] all subs ready ======');
			} else {
				console.log('====== [hello2] all subs not ready yet ======');
			}
		});
	});

	// For the heck of it, make all data views global helpers
	_.forEach({
		BooItems: function() {
			return Boo.find();
		},
		HooItems: function() {
			return Hoo.find();
		},
		BooMirrorItems: function() {
			return BooMirror.find();
		},
		HooMirrorItems: function() {
			return HooMirror.find();
		}
	}, function(fn, name) {
		Template.registerHelper(name, fn);
	});
}

if (Meteor.isServer) {
	_EnsureIndexes.addIndex('boo', [
		['idx1', 1]
	]);
	Meteor.startup(function() {
		console.log('=================================');
		console.log('=      Begin Index Listing      =');
		console.log('=================================');
		_EnsureIndexes.list();
		console.log('=================================');
		console.log('=       End Index Listing       =');
		console.log('=================================');

		console.log('');
		console.log('');

		console.log('=================================');
		console.log('=   Begin Extra Index Listing   =');
		console.log('=================================');
		_EnsureIndexes.listExtraIndexes();
		console.log('=================================');
		console.log('=    End Extra Index Listing    =');
		console.log('=================================');
	});
}