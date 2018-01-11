import React from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';

import keys from 'lodash/keys';
import values from 'lodash/values';
import omit from 'lodash/omit';
import isEqual from 'lodash/isEqual';

import SuggestionsOverlay from './SuggestionsOverlay';

const CaretFinder = require(`./CaretFinder`);
const {
  escapeRegex,
  noop,
  isNumber,
  getPlainText,
  getPlainAndStripped,
  applyChangeToValue,
  getMentions,
  makeMentionsMarkup,
  findStartOfMentionInPlainText,
  countSuggestions,
  getSuggestion,
  mapPlainTextIndex,
  spliceString,
  getEndOfLastMention,
  extend
} = require(`./utils`);

export const _getTriggerRegex = function(trigger, options = {}){
  if(trigger instanceof RegExp) return trigger;

  const { allowSpaceInQuery } = options;
  const escapedTriggerChar = escapeRegex(trigger);

  // first capture group is the part to be replaced on completion
  // second capture group is for extracting the search query
  return new RegExp(`(?:^|\\s)(${escapedTriggerChar}([^${allowSpaceInQuery ? `` : `\\s`}${escapedTriggerChar}]*))$`);
};

const _getDataProvider = function(data){
  if(data instanceof Array){
    // if data is an array, create a function to query that
    return function(query){
      const results = [];
      for(let i = 0, l = data.length; i < l; ++i){
        const display = data[i].display || data[i].id;
        if(display.toLowerCase().indexOf(query.toLowerCase()) >= 0){
          results.push(data[i]);
        }
      }
      return results;
    };
  }else{
    // expect data to be a query function
    return data;
  }
};

const KEY = { TAB: 9, RETURN: 13, ESC: 27, UP: 38, DOWN: 40 };

const propTypes = {
  /**
   * If set to `true` spaces will not interrupt matching suggestions
   */
  allowSpaceInQuery: PropTypes.bool,

  markup: PropTypes.string,
  value: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,

  className: PropTypes.string,
  refProp: PropTypes.string,
  inputRef: PropTypes.func,
  component: PropTypes.func.isRequired,
  displayTransform: PropTypes.func,
  onKeyDown: PropTypes.func,
  onSelect: PropTypes.func,
  onBlur: PropTypes.func,
  onChange: PropTypes.func,

  children: PropTypes.oneOfType([
    PropTypes.element,
    PropTypes.arrayOf(PropTypes.element)
  ]).isRequired
};

const propKeys = keys(propTypes);

let isComposing = false;

class MentionsInput extends React.Component {
  static propTypes = propTypes;

  static defaultProps = {
    markup: `@[__id__:__type__:__display__]`,
    className: `mentions-input`,
    refProp: `ref`,
    inputRef: () => {},
    displayTransform(_id, display, _type){
      return display;
    },
    onChange: noop,
    onKeyDown: noop,
    onSelect: noop,
    onBlur: noop
  };

  state = {
    focusIndex: 0,

    selectionStart: null,
    selectionEnd: null,

    suggestions: {},

    caretPosition: null,
    suggestionsPosition: null
  };

  suggestions = {};

  render(){
    const { name, value, markup, displayTransform, style } = this.props;
    const { plain, stripped } = getPlainAndStripped(value, markup, displayTransform);
    return <div class="mentions-input-container" {...style}>
      <input type="hidden" name={name} value={stripped} />

      {this.renderCaretFinder(plain)}
      {this.renderControl(plain)}

      {this.renderSuggestionsOverlay()}
    </div>;
  }

  setCaretPosition = ::this.setCaretPosition;
  setCaretPosition(caretPosition){
    this.setState({
      caretPosition
    });
  }

  renderCaretFinder(value){
    const { className } = this.props;
    const { selectionStart } = this.state;
    return <CaretFinder
      class={className}
      selectionStart={selectionStart || 0}
      value={value}
      onCaretPositionChange={this.setCaretPosition}
    />;
  }

  setInputRef = ::this.setInputRef;
  setInputRef(ref){
    this.inputRef = ref;
    this.props.inputRef(ref);
  }

  getInputProps(value){
    const { readOnly, disabled, refProp, className } = this.props;

    // pass all props that we don't use through to the input control
    const props = omit(this.props, propKeys);

    return {
      ...props,
      style: {
        width: `100%`,
        height: `100%`,
        bottom: 0,
        overflow: `hidden`,
        resize: `none`
      },

      className,
      value,
      [refProp]: this.setInputRef,

      ...!readOnly && !disabled && {
        onChange: this.handleChange,
        onSelect: this.handleSelect,
        onKeyDown: this.handleKeyDown,
        onBlur: this.handleBlur,
        onCompositionStart: this.handleCompositionStart,
        onCompositionEnd: this.handleCompositionEnd
      }
    };
  }

  renderControl(value){
    const { component: Component } = this.props;
    const inputProps = this.getInputProps(value);

    return <Component {...inputProps} />;
  }

  setSuggestionsRef = ::this.setSuggestionsRef;
  setSuggestionsRef(ref){
    this.suggestionsRef = ref;
  }

  setFocusIndex = ::this.setFocusIndex;
  setFocusIndex(focusIndex){
    if(focusIndex === this.state.focusIndex) return;
    this.setState({
      focusIndex,
      scrollFocusedIntoView: false
    });
  }

  renderSuggestionsOverlay(){
    if(!isNumber(this.state.selectionStart)){
      // do not show suggestions when the input does not have the focus
      return null;
    }
    const {
      suggestionsPosition,
      focusIndex,
      scrollFocusedIntoView,
      suggestions
    } = this.state;

    return ReactDOM.createPortal(<SuggestionsOverlay
      position={suggestionsPosition}
      focusIndex={focusIndex}
      scrollFocusedIntoView={scrollFocusedIntoView}
      ref={this.setSuggestionsRef}
      suggestions={suggestions}
      onSelect={this.addMention}
      onMouseDown={this.handleSuggestionsMouseDown}
      onMouseMove={this.setFocusIndex}
      isLoading={this.isLoading()}
    />, document.body);
  }

  executeOnChange(){
    this.props.onChange.apply(null, arguments);
  }

  handleChange = ::this.handleChange;
  handleChange(ev){
    // if we are inside iframe, we need to find activeElement within its contentDocument
    const currentDocument = (document.activeElement && document.activeElement.contentDocument) || document;
    if(currentDocument.activeElement !== ev.target){
      // fix an IE bug (blur from empty input element with placeholder attribute trigger "input" event)
      return;
    }

    const value = this.props.value || ``;
    let newPlainTextValue = ev.target.value;

    // Derive the new value to set by applying the local change in the textarea's plain text
    const newValue = applyChangeToValue(
      value, this.props.markup,
      newPlainTextValue,
      this.state.selectionStart, this.state.selectionEnd,
      ev.target.selectionEnd,
      this.props.displayTransform
    );

    // In case a mention is deleted, also adjust the new plain text value
    newPlainTextValue = getPlainText(newValue, this.props.markup, this.props.displayTransform);

    // Save current selection after change to be able to restore caret position after rerendering
    let selectionStart = ev.target.selectionStart;
    let selectionEnd = ev.target.selectionEnd;
    let setSelectionAfterMentionChange = false;

    // Adjust selection range in case a mention will be deleted by the characters outside of the
    // selection range that are automatically deleted
    const startOfMention = findStartOfMentionInPlainText(value, this.props.markup, selectionStart, this.props.displayTransform);

    if(startOfMention !== undefined && this.state.selectionEnd > startOfMention){
      // only if a deletion has taken place
      selectionStart = startOfMention;
      selectionEnd = selectionStart;
      setSelectionAfterMentionChange = true;
    }

    this.setState({
      selectionStart,
      selectionEnd,
      setSelectionAfterMentionChange
    });

    const mentions = getMentions(newValue, this.props.markup);

    this.executeOnChange(newValue, newPlainTextValue, mentions);
  }

  handleSelect = ::this.handleSelect
  handleSelect(ev){
    // do nothing while a IME composition session is active
    if(isComposing) return;

    // keep track of selection range / caret position
    this.setState({
      selectionStart: ev.target.selectionStart,
      selectionEnd: ev.target.selectionEnd
    });

    // refresh suggestions queries
    const el = this.inputRef;
    if(ev.target.selectionStart === ev.target.selectionEnd){
      this.updateMentionsQueries(el.value, ev.target.selectionStart);
    }else{
      this.clearSuggestions();
    }

    this.props.onSelect(ev);
  }

  handleKeyDown = ::this.handleKeyDown;
  handleKeyDown(ev){
    // do not intercept key events if the suggestions overlay is not shown
    const suggestionsCount = countSuggestions(this.state.suggestions);

    const suggestionsComp = this.suggestionsRef;
    if(suggestionsCount === 0 || !suggestionsComp){
      this.props.onKeyDown(ev);

      return;
    }

    if(values(KEY).indexOf(ev.keyCode) >= 0){
      ev.preventDefault();
    }

    switch(ev.keyCode){
      case KEY.ESC:{
        this.clearSuggestions();
        return;
      }
      case KEY.DOWN:{
        this.shiftFocus(+1);
        return;
      }
      case KEY.UP:{
        this.shiftFocus(-1);
        return;
      }
      case KEY.RETURN:{
        this.selectFocused();
        return;
      }
      case KEY.TAB:{
        this.selectFocused();
        return;
      }
    }
  }

  shiftFocus(delta){
    const suggestionsCount = countSuggestions(this.state.suggestions);

    this.setState({
      focusIndex: (suggestionsCount + this.state.focusIndex + delta) % suggestionsCount,
      scrollFocusedIntoView: true
    });
  }

  selectFocused(){
    const { suggestions, focusIndex } = this.state;
    const { suggestion, descriptor } = getSuggestion(suggestions, focusIndex);

    this.addMention(suggestion, descriptor);

    this.setState({
      focusIndex: 0
    });
  }

  handleBlur = ::this.handleBlur;
  handleBlur(ev){
    const clickedSuggestion = this._suggestionsMouseDown;
    this._suggestionsMouseDown = false;

    // only reset selection if the mousedown happened on an element
    // other than the suggestions overlay
    if(!clickedSuggestion){
      this.setState({
        selectionStart: null,
        selectionEnd: null
      });
    }

    this.props.onBlur(ev, clickedSuggestion);
  }

  handleSuggestionsMouseDown = ::this.handleSuggestionsMouseDown;
  handleSuggestionsMouseDown(){
    this._suggestionsMouseDown = true;
  }

  updateSuggestionsPosition(){
    const { caretPosition } = this.state;

    if(!caretPosition || !this.suggestionsRef) return;

    const suggestions = this.suggestionsRef.domRef;

    if(!suggestions) return;

    const { left, top } = caretPosition;
    const position = {
      left,
      top
    };

    if(isEqual(position, this.state.suggestionsPosition)){
      return;
    }

    this.setState({
      suggestionsPosition: position
    });
  }

  handleCompositionStart = ::this.handleCompositionStart;
  handleCompositionStart(){
    isComposing = true;
  }

  handleCompositionEnd = ::this.handleCompositionEnd;
  handleCompositionEnd(){
    isComposing = false;
  }

  componentDidMount(){
    this.updateSuggestionsPosition();
  }

  componentDidUpdate(){
    this.updateSuggestionsPosition();

    // maintain selection in case a mention is added/removed causing
    // the cursor to jump to the end
    if(this.state.setSelectionAfterMentionChange){
      this.setState({setSelectionAfterMentionChange: false});
      this.setSelection(this.state.selectionStart, this.state.selectionEnd);
    }
  }

  setSelection(selectionStart, selectionEnd){
    if(selectionStart === null || selectionEnd === null) return;

    const el = this.inputRef;
    if(el.setSelectionRange){
      el.setSelectionRange(selectionStart, selectionEnd);
    }
    else if(el.createTextRange){
      const range = el.createTextRange();
      range.collapse(true);
      range.moveEnd(`character`, selectionEnd);
      range.moveStart(`character`, selectionStart);
      range.select();
    }
  }

  updateMentionsQueries(plainTextValue, caretPosition){
    // Invalidate previous queries. Async results for previous queries will be neglected.
    this._queryId++;
    this.suggestions = {};
    this.setState({
      suggestions: {}
    });

    const value = this.props.value || ``;
    const positionInValue = mapPlainTextIndex(
      value, this.props.markup, caretPosition, `NULL`, this.props.displayTransform
    );

    // If caret is inside of mention, do not query
    if(positionInValue === null){
      return;
    }

    // Extract substring in between the end of the previous mention and the caret
    const substringStartIndex = getEndOfLastMention(
      value.substring(0, positionInValue),
      this.props.markup,
      this.props.displayTransform
    );
    const substring = plainTextValue.substring(
      substringStartIndex,
      caretPosition
    );

    // Check if suggestions have to be shown:
    // Match the trigger patterns of all Mention children on the extracted substring
    React.Children.forEach(this.props.children, child => {
      if(!child){
        return;
      }

      const regex = _getTriggerRegex(child.props.trigger, this.props);
      const match = substring.match(regex);
      if(match){
        const querySequenceStart = substringStartIndex + substring.indexOf(match[1], match.index);
        this.queryData(
          match[2],
          child,
          querySequenceStart,
          querySequenceStart + match[1].length,
          plainTextValue
        );
      }
    });
  }

  clearSuggestions(){
    // Invalidate previous queries. Async results for previous queries will be neglected.
    this._queryId++;
    this.suggestions = {};
    this.setState({
      suggestions: {},
      focusIndex: 0
    });
  }

  queryData(query, mentionDescriptor, querySequenceStart, querySequenceEnd, plainTextValue){
    const provideData = _getDataProvider(mentionDescriptor.props.data);
    const snycResult = provideData(query, this.updateSuggestions.bind(this, this._queryId, mentionDescriptor, query, querySequenceStart, querySequenceEnd, plainTextValue));
    if(snycResult instanceof Array){
      this.updateSuggestions(this._queryId, mentionDescriptor, query, querySequenceStart, querySequenceEnd, plainTextValue, snycResult);
    }
  }

  updateSuggestions(queryId, mentionDescriptor, query, querySequenceStart, querySequenceEnd, plainTextValue, suggestions){
    // neglect async results from previous queries
    if(queryId !== this._queryId) return;

    const update = {};
    update[mentionDescriptor.props.type] = {
      query,
      mentionDescriptor,
      querySequenceStart,
      querySequenceEnd,
      results: suggestions,
      plainTextValue
    };

    // save in property so that multiple sync state updates from different mentions sources
    // won't overwrite each other
    this.suggestions = extend({}, this.suggestions, update);

    const { focusIndex } = this.state;
    const suggestionsCount = countSuggestions(this.suggestions);
    this.setState({
      suggestions: this.suggestions,
      focusIndex: focusIndex >= suggestionsCount ? Math.max(suggestionsCount - 1, 0) : focusIndex
    });
  }

  addMention = ::this.addMention
  addMention(suggestion, {mentionDescriptor, querySequenceStart, querySequenceEnd, plainTextValue}){
    // Insert mention in the marked up value at the correct position
    const value = this.props.value || ``;
    const start = mapPlainTextIndex(value, this.props.markup, querySequenceStart, `START`, this.props.displayTransform);
    const end = start + querySequenceEnd - querySequenceStart;
    let insert = makeMentionsMarkup(this.props.markup, suggestion.id, suggestion.display, mentionDescriptor.props.type);
    if(mentionDescriptor.props.appendSpaceOnAdd){
      insert = `${insert } `;
    }
    const newValue = spliceString(value, start, end, insert);

    // Refocus input and set caret position to end of mention
    this.inputRef.focus();

    let displayValue = this.props.displayTransform(suggestion.id, suggestion.display, mentionDescriptor.props.type);
    if(mentionDescriptor.props.appendSpaceOnAdd){
      displayValue = `${displayValue } `;
    }
    const newCaretPosition = querySequenceStart + displayValue.length;
    this.setState({
      selectionStart: newCaretPosition,
      selectionEnd: newCaretPosition,
      setSelectionAfterMentionChange: true
    });

    // Propagate change
    const mentions = getMentions(newValue, this.props.markup);
    const newPlainTextValue = spliceString(plainTextValue, querySequenceStart, querySequenceEnd, displayValue);

    this.executeOnChange(newValue, newPlainTextValue, mentions);

    const onAdd = mentionDescriptor.props.onAdd;
    if(onAdd){
      onAdd(suggestion.id, suggestion.display);
    }

    // Make sure the suggestions overlay is closed
    this.clearSuggestions();
  }

  isLoading(){
    let isLoading = false;
    React.Children.forEach(this.props.children, function(child){
      isLoading = isLoading || (child && child.props.isLoading);
    });
    return isLoading;
  }

  _queryId = 0;
}

module.exports = MentionsInput;