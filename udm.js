#!/usr/bin/env node

var semver = require('semver');
require('shelljs/global');

var each = function (object, fn) {
  for (var prop in object) { fn(object[prop], prop); }
};

var getTags = (function () {
  var cache = {};

  var RE = {
    LINES: /\n/g,
    TAG_PREFIX: /^.*refs\/tags\//g
  };

  return function (domain, package, versionRange) {
    var remote = 'https://github.com/' + domain + '/' + package + '.git';
    if (cache[remote]) { return cache[remote]; }

    var cmd = exec('git ls-remote -t ' + remote, { silent: true }),
        output = cmd.output.split(RE.LINES).slice(0, -1);

    var tags = output.map(function (line) {
      return line.replace(RE.TAG_PREFIX, '');
    });

    cache[remote] = tags;
    return tags;
  };
})();

var findMaxTag = function (domain, package, versionRange) {
  if (versionRange === 'master') { return 'master'; }

  var tags = getTags(domain, package, versionRange);
  if (!tags.length) { return; }

  var tagsInRange =  tags.filter(function (tag) {
    return semver.satisfies(semver.clean(tag), versionRange);
  });

  var compareTags = function (a, b) {
    return semver.compare(semver.clean(a), semver.clean(b));
  };

  return tagsInRange.sort(compareTags).pop();
};

var pkgConfigFile = 'dependencies.json',
    cache = pwd() + '/dependencies',
    output = 'archive.tar.gz';

// create cache if it does not exist yet
if (!test('-d', cache)) { mkdir(cache); }

var udm = function (config, indent) {
  indent = indent || '';

  each(config, function (item, index) {
    var tokens = index.split('/'),
        domain = tokens[0],
        package = tokens[1],
        versionRange = item,
        tag = findMaxTag(domain, package, versionRange);

    var pkgLog = indent + domain + '/' + package + '@' + versionRange + ': ';

    if (!tag) {
      echo(pkgLog + 'err: no version found');
      return;
    }

    var version = tag === 'master' ? tag : semver.clean(tag);
    echo(pkgLog + version);

    var prefix = package + '-' + version,
        dest = package + '/' + version,
        childConfigFile = dest + '/' + pkgConfigFile,
        config = null;

    var url = [
      'https://github.com',
      domain,
      package,
      'archive',
      tag + '.tar.gz'
    ].join('/');

    // check cached versions
    cd(cache);
    if (test('-d', dest)) { return; }

    // download archive
    if (exec('curl -Lsk ' + url + ' -o ' + output, { silent: true }).code !== 0) {
      echo('err: downloading archive');
      return;
    }

    // extract archive
    if (exec('tar -xzf ' + output, { silent: true }).code !== 0) {
      echo('err: extracting archive');
      rm(output);
      return;
    }

    // cleanup
    rm(output);
    if (!test('-d', package)) { mkdir(package); }
    mv(prefix, dest);

    // check nested dependencies
    if (test('-f', childConfigFile)) {
      config = JSON.parse(cat(childConfigFile));
      if (config) { udm(config, indent + '  '); }
    }
  });
};

var config = JSON.parse(cat(pkgConfigFile));
udm(config);
