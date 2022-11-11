const fs = require('fs');

const crypto = require('crypto');

const allDoodles = require('./doodles.all.json');

const linkTypes = [
  'alternate_url',
  'call_to_action_image_url',
  'hires_url',
  'standalone_html',
  'url',
];

const urlPrefixes = [
  'lh3.googleusercontent.com',
  'www.google.com/logos',
  'www.google.com/logos/doodles',
];

const schema = [
  /* 'alternate_url',
  'blog_text',
  'call_to_action_image_url',
  'collection_id',
  'countries',
  'doodle_args',
  'doodle_type',
  'height',
  'hires_height',
  'hires_width',
  'history_doodles',
  'id',
  'is_animated_gif',
  'is_dynamic',
  'is_global',
  'is_highlighted',
  'name',
  'persistent_id',
  'query',
  'related_doodles',
  'share_text',
  'standalone_html',
  'tags',
  'translations',
  'width',
  'youtube_id',
  */

  'hires_url',
  'next_doodle',
  'prev_doodle',
  'run_date_array',
  'title',
  'url',

  '_id', // unique ID for each doodle
];

/**
 * Generate unique hashes for doodles, deterministically.
 * @param   {object} doodle - Doodle object to generate hash for.
 * @returns {string}          Unique hash for supplied doodle.
 */
function generateDoodleHash(doodle) {
  return crypto
    .createHash('md5')
    .update(`[${doodle.name}](${doodle.url})`, 'ascii')
    .digest('hex');
}

/**
 * Write JSON to a file.
 * @param {string} filepath - absolute path of output file
 * @param {any}    json     - JSON to write
 * @param {bool}   pretty   - Pretty print
 */
function writeJSON(filepath, json, pretty = false) {
  fs.writeFileSync(filepath, JSON.stringify(json, null, pretty ? 2 : 0));
}

const uniqueDoodles = {};
const allCountriesSet = new Set();
const allTagsSet = new Set();

allDoodles.forEach(doodle => {
  doodle._id = generateDoodleHash(doodle);

  uniqueDoodles[doodle._id] = doodle;

  doodle.countries.forEach(country => {
    country = country.trim().toLowerCase();
    allCountriesSet.add(country);
  });

  doodle.tags.forEach(tag => {
    tag = tag.trim().toLowerCase();
    allTagsSet.add(tag);
  });
});

const allCountries = Array.from(allCountriesSet);
const allTags = Array.from(allTagsSet);

const cleanDoodles = allDoodles
  .map(doodle => {
    if (doodle.next_doodle !== null) {
      const nextDoodle = doodle.next_doodle;
      const nextDoodleHash = generateDoodleHash(nextDoodle);

      doodle.next_doodle = nextDoodleHash;
    }

    if (doodle.prev_doodle !== null) {
      const prevDoodle = doodle.prev_doodle;
      const prevDoodleHash = generateDoodleHash(prevDoodle);

      doodle.prev_doodle = prevDoodleHash;
    }

    doodle.related_doodles = doodle.related_doodles.map(relatedDoodle => {
      const relatedDoodleHash = generateDoodleHash(relatedDoodle);

      return relatedDoodleHash;
    });

    doodle.history_doodles = doodle.history_doodles.map(historyDoodle => {
      const historyDoodleHash = generateDoodleHash(historyDoodle);

      return historyDoodleHash;
    });
    return doodle;
  })
  .map(doodle => {
    doodle.countries = doodle.countries.map(country =>
      allCountries.indexOf(country.trim().toLowerCase()),
    );

    doodle.tags = doodle.tags.map(tag =>
      allTags.indexOf(tag.trim().toLowerCase()),
    );

    return doodle;
  })
  .map(doodle => {
    linkTypes.forEach(linkType => {
      const link = doodle[linkType];

      if (!link) {
        console.warn('No link', linkType);
        return;
      }

      switch (true) {
        case link.startsWith('https://lh3.googleusercontent.com'):
          doodle[linkType] = link.replace(
            'https://lh3.googleusercontent.com',
            0,
          );
          break;

        case link.startsWith('//www.google.com/logos'):
          doodle[linkType] = link.replace('//www.google.com/logos', 1);
          break;

        case link.startsWith('/logos'):
          doodle[linkType] = link.replace('/logos', 1);
          break;

        case link.startsWith('//www.google.com/logos/doodles'):
          doodle[linkType] = link.replace('//www.google.com/logos/doodles', 2);
          break;
      }
    });

    return doodle;
  })
  .map(doodle => schema.map(key => doodle[key]));

writeJSON('doodles.clean.json', cleanDoodles);

writeJSON('meta.json', {
  countries: allCountries,
  tags: allTags,
  schema,
  urlPrefixes,
});