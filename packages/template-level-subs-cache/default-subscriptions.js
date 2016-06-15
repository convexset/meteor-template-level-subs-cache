/* global DefaultSubscriptions: true */

import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';
checkNpmVersions({
  'package-utils': '^0.2.1',
  'underscore' : '^1.8.3',
});
const PackageUtilities = require('package-utils');
const _ = require('underscore');

DefaultSubscriptions = (function() {
	var _dp = function DefaultSubscriptions() {};
	var dp = new _dp();

	var _subs;
	var _subPresence;

	if (Meteor.isClient) {
		_subs = {};
		_subPresence = new ReactiveDict();
	}

	PackageUtilities.addImmutablePropertyFunction(dp, 'add', function addDefaultPublication(pubName, pubFunction = null) {
		if (_.isFunction(pubFunction)) {
			if (Meteor.isServer) {
				Meteor.publish(pubName, pubFunction);
			}
		}

		if (Meteor.isClient) {
			Meteor.startup(function() {
				_subPresence.set(pubName, 1);
				_subs[pubName] = Meteor.subscribe(pubName);
			});
		}
	});

	var listSubscriptions;

	if (Meteor.isClient) {
		PackageUtilities.addImmutablePropertyFunction(dp, 'isReady', function isReady(pubName) {
			var subPresent = _subPresence.get(pubName);
			if (typeof subPresent !== "undefined") {
				return _subs[pubName].ready();
			} else {
				throw new Meteor.Error('no-such-default-publication', pubName);
			}
		});

		listSubscriptions = function listSubscriptions() {
			_subPresence.all();
			return PackageUtilities.shallowCopy(_subs);
		};
		// PackageUtilities.addImmutablePropertyFunction(dp, 'listSubscriptions', listSubscriptions);
		PackageUtilities.addImmutablePropertyFunction(dp, 'listSubscriptionNames', Object.keys(listSubscriptions()));

		PackageUtilities.addImmutablePropertyFunction(dp, 'allReady', function allReady() {
			var readyList = _.map(listSubscriptions(), sub => sub.ready());
			return readyList.reduce((acc, x) => acc && x, true);
		});

		Template.registerHelper('defaultSubscriptionIsReady', pubId => DefaultSubscriptions.isReady(pubId));
		Template.registerHelper('defaultSubscriptionsAllReady', () => DefaultSubscriptions.allReady());
	}

	return dp;
})();