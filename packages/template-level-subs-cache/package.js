Package.describe({
	name: 'convexset:template-level-subs-cache',
	version: '0.1.4_3',
	summary: 'A template-level subscriptions cache providing for reactive parameters',
	git: 'https://github.com/convexset/meteor-template-level-subs-cache',
	documentation: '../../README.md'
});


Package.onUse(function(api) {
	api.versionsFrom('1.3.1');

	api.use([
		'ecmascript', 'underscore', 'ejson', 'mongo',
		'dburles:mongo-collection-instances@0.3.5',
		'tmeasday:check-npm-versions@0.3.1'
	]);

	api.use(
		[
			'reactive-var', 'reactive-dict',
			'blaze-html-templates',
			'ccorcos:subs-cache@0.1.0'
		],
		'client'
	);

	api.addFiles('template-level-subs-cache.js', 'client');
	api.export('TemplateLevelSubsCache', 'client')

	api.addFiles('default-subscriptions.js');
	api.export('DefaultSubscriptions');

	api.addFiles('ensure-indexes.js');
	api.export('_EnsureIndexes');
});


Package.onTest(function(api) {
	api.use(['tinytest', 'ecmascript', 'underscore', 'ejson', ]);
	api.use('convexset:template-level-subs-cache');
	api.addFiles(['tests.js', ]);
	api.addFiles([], 'server');
	api.addFiles([], 'client');
});