Package.describe({
	// [validatis:stack]
	name: 'convexset:template-level-subs-cache',
	version: '0.1.6_3',
	summary: 'A template-level subscriptions cache providing for reactive parameters',
	git: 'https://github.com/convexset/meteor-template-level-subs-cache',
	documentation: '../../README.md'
});


Package.onUse(function(api) {
	api.versionsFrom('1.3.1');

	api.use([
		'ecmascript', 'ejson', 'mongo',
		'dburles:mongo-collection-instances@0.3.5',
		'tmeasday:check-npm-versions@0.3.1'
	]);

	api.use(
		[
			'reactive-var', 'reactive-dict',
			'blaze-html-templates',
			'jimmiebtlr:subs-cache@0.1.0'  // fix for a Meteor.setTimeout issue (https://github.com/ccorcos/meteor-subs-cache/issues/10); was: 'ccorcos:subs-cache@0.1.0'
		],
		'client'
	);

	// client only
	api.addFiles('create-cached-subscription-instance.js', 'client');
	api.addFiles('template-level-subs-cache.js', 'client');
	api.addFiles('block-helpers.html', 'client');
	api.export('TemplateLevelSubsCache', 'client');

	// client and server
	api.addFiles('default-subscriptions.js');
	api.export('DefaultSubscriptions');
	api.addFiles('information-bundler.js');
	api.export('InformationBundler');

	// server only
	api.addFiles('ensure-indexes.js', 'server');
	api.export('_EnsureIndexes', 'server');
});
