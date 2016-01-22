/* global Fake: true */
/* global Boo: true */
/* global Hoo: true */
/* global idx1: true */
/* global TemplateLevelSubsCache: true */
/* global Template: true */
/* global hello2: true */

Boo = new Mongo.Collection("boo");
Hoo = new Mongo.Collection("hoo");
idx1 = new ReactiveVar(0);

if (Meteor.isServer) {
	Meteor.startup(function() {
		Boo.remove({});
		Hoo.remove({});
		_.range(10).forEach(function(idx1) {
			var items = _.range(2 + Math.floor(5 * Math.random())).map(() => Fake.word());
			Boo.insert({
				idx1: idx1,
				content: items.join(", "),
			});
			items.forEach(function(item, idx2) {
				Hoo.insert({
					idx1: idx1,
					idx2: idx2,
					item: item,
				});
			});
		});
	});

	Meteor.publish('all', function() {
		return [
			Boo.find(),
			Hoo.find(),
		];
	});

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
}

if (Meteor.isClient) {
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

	TemplateLevelSubsCache.DEBUG_MODE = true;
	var TLSC = TemplateLevelSubsCache.makeCache({
		expireAfter: 0.0166667 * 2,
	});

	Template.hello1.onCreated(function() {
		this.subscribe('all');
	});

	TLSC.prepareCachedSubscription(Template.hello2, 'boo-step-1', ['boo-step-1',
		function() {
			var thisIdx = idx1.get();
			console.log('[Sub Step 1|Args] idx1: ' + thisIdx);
			return thisIdx;
		}
	]);
	TLSC.prepareCachedSubscription(
		Template.hello2,
		'hoo-step-2', ['hoo-step-2', hooArg], {
			startOnCreated: false
		});

	Template.hello2.onCreated(function() {
		hello2 = this;
	});

	Template.hello2.onRendered(function() {
		var instance = this;

		['boo-step-1', 'hoo-step-2'].forEach(function(subId) {
			Tracker.autorun(function() {
				if (instance.cachedSubscription.cachedSubReady(subId)) {
					console.log('--- [hello2] ' + subId + ' ready ---');
				} else {
					console.log('--- [hello2] ' + subId + ' not ready yet ---');
				}
			});
		});

		Tracker.autorun(function() {
			if (instance.cachedSubscription.allSubsReady()) {
				console.log('--- [hello2] all subs ready ---');
			} else {
				console.log('--- [hello2] all subs not ready yet ---');
			}
		});
	});

	_.forEach({
		BooItems: function() {
			return Boo.find();
		},
		HooItems: function() {
			return Hoo.find();
		}
	}, function(fn, name) {
		Template.registerHelper(name, fn);
	});
}