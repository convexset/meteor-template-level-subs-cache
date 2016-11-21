Package.describe({
	// [validatis:stack]
	name: 'convexset:template-level-subs-cache',
	version: '0.1.8_4',
	summary: 'A template-level subscriptions cache providing for reactive parameters',
	git: 'https://github.com/convexset/meteor-template-level-subs-cache',
	documentation: '../../README.md'
});


Package.onUse(function pkgSetup(api) {
	api.versionsFrom('1.4.1');

	api.use([
		'ecmascript', 'ejson', 'mongo',
		'dburles:mongo-collection-instances@0.3.5',
		'aldeed:template-extension@4.0.0',
		'tmeasday:check-npm-versions@0.3.1'
	]);

	api.use(
		[
			'reactive-var', 'reactive-dict',
			'templating', 'spacebars',
			'jimmiebtlr:subs-cache@0.2.0'  // fix for a Meteor.setTimeout issue (https://github.com/ccorcos/meteor-subs-cache/issues/10); was: 'ccorcos:subs-cache@0.1.0'
		],
		'client'
	);

	api.mainModule('index-client.js', 'client');
	api.mainModule('index-server.js', 'server');
});
