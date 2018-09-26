/* eslint eol-last: ["error", "always"] */

const PLACEHOLDERS = {
  id: `__id__`,
  display: `__display__`,
  type: `__type__`
};

const numericComparator = function(a, b){
  a = a === null ? Number.MAX_VALUE : a;
  b = b === null ? Number.MAX_VALUE : b;
  return a - b;
};

export const noop = () => {};

export function escapeRegex(str){
  return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, `\\$&`);
}

export function markupToRegex(markup, matchAtEnd){
  let markupPattern = escapeRegex(markup);
  markupPattern = markupPattern.replace(PLACEHOLDERS.display, `(.+?)`);
  markupPattern = markupPattern.replace(PLACEHOLDERS.id, `(.+?)`);
  markupPattern = markupPattern.replace(PLACEHOLDERS.type, `(.+?)`);
  if(matchAtEnd){
    // append a $ to match at the end of the string
    markupPattern = `${markupPattern}$`;
  }
  return new RegExp(markupPattern, `g`);
}

export function spliceString(str, start, end, insert){
  return str.substring(0, start) + insert + str.substring(end);
}

export function extend(obj){
  let source;
  let prop;
  for(let i = 1, length = arguments.length; i < length; i++){
    source = arguments[i];
    for(prop in source){
      if(hasOwnProperty.call(source, prop)){
          obj[prop] = source[prop];
      }
    }
  }
  return obj;
}

/**
 * parameterName: "id", "display", or "type"
 */
export function getPositionOfCapturingGroup(markup, parameterName){
  if(parameterName !== `id` && parameterName !== `display` && parameterName !== `type`){
    throw new Error(`parameterName must be 'id', 'display', or 'type'`);
  }

  // calculate positions of placeholders in the markup
  let indexDisplay = markup.indexOf(PLACEHOLDERS.display);
  let indexId = markup.indexOf(PLACEHOLDERS.id);
  let indexType = markup.indexOf(PLACEHOLDERS.type);

  // set indices to null if not found
  if(indexDisplay < 0) indexDisplay = null;
  if(indexId < 0) indexId = null;
  if(indexType < 0) indexType = null;

  if(indexDisplay === null && indexId === null){
    // markup contains none of the mandatory placeholders
    throw new Error(`The markup \`${ markup }\` must contain at least one of the placeholders \`__id__\` or \`__display__\``);
  }

  if(indexType === null && parameterName === `type`){
    // markup does not contain optional __type__ placeholder
    return null;
  }

  // sort indices in ascending order (null values will always be at the end)
  const sortedIndices = [indexDisplay, indexId, indexType].sort(numericComparator);

  // If only one the placeholders __id__ and __display__ is present,
  // use the captured string for both parameters, id and display
  if(indexDisplay === null) indexDisplay = indexId;
  if(indexId === null) indexId = indexDisplay;

  if(parameterName === `id`) return sortedIndices.indexOf(indexId);
  if(parameterName === `display`) return sortedIndices.indexOf(indexDisplay);
  if(parameterName === `type`) return indexType === null ? null : sortedIndices.indexOf(indexType);
}

// Finds all occurences of the markup in the value and iterates the plain text sub strings
// in between those markups using `textIteratee` and the markup occurrences using the
// `markupIteratee`.
export function iterateMentionsMarkup(value, markup, textIteratee, markupIteratee, displayTransform){
  const regex = markupToRegex(markup);
  const displayPos = getPositionOfCapturingGroup(markup, `display`);
  const idPos = getPositionOfCapturingGroup(markup, `id`);
  const typePos = getPositionOfCapturingGroup(markup, `type`);

  let match;
  let start = 0;
  let currentPlainTextIndex = 0;

  // detect all mention markup occurences in the value and iterate the matches
  while((match = regex.exec(value)) !== null){
    const id = match[idPos + 1];
    let display = match[displayPos + 1];
    const type = typePos !== null ? match[typePos + 1] : null;

    if(displayTransform) display = displayTransform(id, display, type);

    const substr = value.substring(start, match.index);
    textIteratee(substr, start, currentPlainTextIndex);
    currentPlainTextIndex += substr.length;

    markupIteratee(match[0], match.index, currentPlainTextIndex, id, display, type, start);
    currentPlainTextIndex += display.length;

    start = regex.lastIndex;
  }

  if(start < value.length){
    textIteratee(value.substring(start), start, currentPlainTextIndex);
  }
}

// For the passed character index in the plain text string, returns the corresponding index
// in the marked up value string.
// If the passed character index lies inside a mention, the value of `inMarkupCorrection` defines the
// correction to apply:
//   - 'START' to return the index of the mention markup's first char (default)
//   - 'END' to return the index after its last char
//   - 'NULL' to return null
export function mapPlainTextIndex(value, markup, indexInPlainText, inMarkupCorrection = `START`, displayTransform){
  if(!isNumber(indexInPlainText)){
    return indexInPlainText;
  }

  let result;
  const textIteratee = function(substr, index, substrPlainTextIndex){
    if(result !== undefined) return;

    if(substrPlainTextIndex + substr.length >= indexInPlainText){
      // found the corresponding position in the current plain text range
      result = index + indexInPlainText - substrPlainTextIndex;
    }
  };
  const markupIteratee = function(markup, index, mentionPlainTextIndex, _id, display, _type, _lastMentionEndIndex){
    if(result !== undefined) return;

    if(mentionPlainTextIndex + display.length > indexInPlainText){
      // found the corresponding position inside current match,
      // return the index of the first or after the last char of the matching markup
      // depending on whether the `inMarkupCorrection`
      if(inMarkupCorrection === `NULL`){
        result = null;
      }else{
        result = index + (inMarkupCorrection === `END` ? markup.length : 0);
      }
    }
  };

  iterateMentionsMarkup(value, markup, textIteratee, markupIteratee, displayTransform);

  // when a mention is at the end of the value and we want to get the caret position
  // at the end of the string, result is undefined
  return result === undefined ? value.length : result;
}

// For a given indexInPlainText that lies inside a mention,
// returns a the index of of the first char of the mention in the plain text.
// If indexInPlainText does not lie inside a mention, returns indexInPlainText.
export function findStartOfMentionInPlainText(value, markup, indexInPlainText, displayTransform){
  let result = indexInPlainText;
  let foundMention = false;

  const markupIteratee = function(_markup, _index, mentionPlainTextIndex, _id, display, _type, _lastMentionEndIndex){
    if(mentionPlainTextIndex <= indexInPlainText && mentionPlainTextIndex + display.length > indexInPlainText){
      result = mentionPlainTextIndex;
      foundMention = true;
    }
  };
  iterateMentionsMarkup(value, markup, noop, markupIteratee, displayTransform);

  if(foundMention){
    return result;
  }
}

// Returns whether the given plain text index lies inside a mention
export function isInsideOfMention(value, markup, indexInPlainText, displayTransform){
  const mentionStart = findStartOfMentionInPlainText(value, markup, indexInPlainText, displayTransform);
  return mentionStart !== undefined && mentionStart !== indexInPlainText;
}

// Applies a change from the plain text textarea to the underlying marked up value
// guided by the textarea text selection ranges before and after the change
export function applyChangeToValue(value, markup, plainTextValue, selectionStartBeforeChange, selectionEndBeforeChange, selectionEndAfterChange, displayTransform){
  const oldPlainTextValue = getPlainText(value, markup, displayTransform);

  const lengthDelta = oldPlainTextValue.length - plainTextValue.length;
  if(selectionStartBeforeChange === `undefined`){
    selectionStartBeforeChange = selectionEndAfterChange + lengthDelta;
  }

  if(selectionEndBeforeChange === `undefined`){
    selectionEndBeforeChange = selectionStartBeforeChange;
  }

  // Fixes an issue with replacing combined characters for complex input. Eg like acented letters on OSX
  if(selectionStartBeforeChange === selectionEndBeforeChange &&
    selectionEndBeforeChange === selectionEndAfterChange &&
    oldPlainTextValue.length === plainTextValue.length
  ){
    selectionStartBeforeChange = selectionStartBeforeChange - 1;
  }

  // extract the insertion from the new plain text value
  let insert = plainTextValue.slice(selectionStartBeforeChange, selectionEndAfterChange);

  // handling for Backspace key with no range selection
  let spliceStart = Math.min(selectionStartBeforeChange, selectionEndAfterChange);

  let spliceEnd = selectionEndBeforeChange;
  if(selectionStartBeforeChange === selectionEndAfterChange){
    // handling for Delete key with no range selection
    spliceEnd = Math.max(selectionEndBeforeChange, selectionStartBeforeChange + lengthDelta);
  }

  let mappedSpliceStart = mapPlainTextIndex(value, markup, spliceStart, `START`, displayTransform);
  let mappedSpliceEnd = mapPlainTextIndex(value, markup, spliceEnd, `END`, displayTransform);

  const controlSpliceStart = mapPlainTextIndex(value, markup, spliceStart, `NULL`, displayTransform);
  const controlSpliceEnd = mapPlainTextIndex(value, markup, spliceEnd, `NULL`, displayTransform);
  const willRemoveMention = controlSpliceStart === null || controlSpliceEnd === null;

  let newValue = spliceString(value, mappedSpliceStart, mappedSpliceEnd, insert);

  if(!willRemoveMention){
    // test for auto-completion changes
    const controlPlainTextValue = getPlainText(newValue, markup, displayTransform);
    if(controlPlainTextValue !== plainTextValue){
      // some auto-correction is going on

      // find start of diff
      spliceStart = 0;
      while(plainTextValue[spliceStart] === controlPlainTextValue[spliceStart]){
        spliceStart++;
      }

      // extract auto-corrected insertion
      insert = plainTextValue.slice(spliceStart, selectionEndAfterChange);

      // find index of the unchanged remainder
      spliceEnd = oldPlainTextValue.lastIndexOf(plainTextValue.substring(selectionEndAfterChange));

      // re-map the corrected indices
      mappedSpliceStart = mapPlainTextIndex(value, markup, spliceStart, `START`, displayTransform);
      mappedSpliceEnd = mapPlainTextIndex(value, markup, spliceEnd, `END`, displayTransform);
      newValue = spliceString(value, mappedSpliceStart, mappedSpliceEnd, insert);
    }
  }

  return newValue;
}

export function getPlainText(value, markup, displayTransform, regex = markupToRegex(markup)){
  const idPos = getPositionOfCapturingGroup(markup, `id`);
  const displayPos = getPositionOfCapturingGroup(markup, `display`);
  const typePos = getPositionOfCapturingGroup(markup, `type`);
  return value.replace(regex, function(){
    // first argument is the whole match, capturing groups are following
    const id = arguments[idPos + 1];
    let display = arguments[displayPos + 1];
    const type = arguments[typePos + 1];
    if(displayTransform) display = displayTransform(id, display, type);
    return display;
  });
}

// export function getTextWithoutMentions(value, markup){
//   const regex = markupToRegex(markup);
//   return value.replace(regex, ``);
// }

export function getPlainAndStripped(value, markup, displayTransform){
  const regex = markupToRegex(markup);
  return {
    plain: getPlainText(value, markup, displayTransform, regex),
    stripped: value.replace(regex, ``)
  };
}

export function getMentions(value, markup, displayTransform){
  const mentions = [];
  iterateMentionsMarkup(value, markup, noop, function(_match, index, plainTextIndex, id, display, type, _start){
    mentions.push({
      id,
      display,
      type,
      index,
      plainTextIndex
    });
  }, displayTransform);
  return mentions;
}

export function getEndOfLastMention(value, markup, displayTransform){
  const mentions = getMentions(value, markup, displayTransform);
  const lastMention = mentions[mentions.length - 1];
  return lastMention ?
    lastMention.plainTextIndex + lastMention.display.length :
    0;
}

export function makeMentionsMarkup(markup, id, display, type){
  let result = markup.replace(PLACEHOLDERS.id, id);
  result = result.replace(PLACEHOLDERS.display, display);
  result = result.replace(PLACEHOLDERS.type, type);
  return result;
}

export function countSuggestions(suggestions){
  let result = 0;
  for(const prop in suggestions){
    if(suggestions.hasOwnProperty(prop)){
      result += suggestions[prop].results.length;
    }
  }
  return result;
}

export function getSuggestions(suggestions){
  let result = [];

  for(const mentionType in suggestions){
    if(!suggestions.hasOwnProperty(mentionType)){
      return;
    }

    result = result.concat({
      suggestions: suggestions[mentionType].results,
      descriptor: suggestions[mentionType]
    });
  }

  return result;
}
export function getDescriptor(suggestions){
  for(const mentionType in suggestions){
    if(!suggestions.hasOwnProperty(mentionType)){
      return;
    }
    return suggestions[mentionType];
  }
}


export function getSuggestion(suggestions, index){
  return getSuggestions(suggestions).reduce((result, { suggestions, descriptor }) => [
    ...result,

    ...suggestions.map((suggestion) => ({
      suggestion,
      descriptor
    }))
  ], [])[index];
}

/**
 * Compares 2 objects if they have the same values.
 * Make sure that they have the same keys. It's a very simple comparison.
 * @param {object} a
 * @param {object} b
 */
export function areValuesEqual(a: Object, b: Object){
  for(const key in a){
    if(a[key] !== b[key]) return false;
  }

  return true;
}

export function isNumber(obj){
  return Object.prototype.toString.call(obj) === `[object Number]`;
}