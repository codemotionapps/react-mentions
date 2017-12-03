import React, { Component } from 'react';
import PropTypes from 'prop-types';
import omit from 'lodash/omit';

const propTypes = {
  id: PropTypes.string.isRequired,
  query: PropTypes.string.isRequired,

  suggestion: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      display: PropTypes.string
    })
  ]).isRequired,
  descriptor: PropTypes.object.isRequired,

  focused: PropTypes.bool
};

const propKeys = Object.keys(propTypes);

class Suggestion extends Component {
  static propTypes = propTypes;

  render(){
    const { query, descriptor, suggestion } = this.props;

    const display = this.getDisplay();
    const highlightedDisplay = this.renderHighlightedDisplay(display, query);

    const props = omit(this.props, propKeys);

    return descriptor.props.renderSuggestion(suggestion, query, highlightedDisplay, props, this.props.focused);
  }

  getDisplay(){
    const { suggestion } = this.props;

    if(suggestion instanceof String){
      return suggestion;
    }

    const { id, display } = suggestion;

    if(!id || !display){
      return id;
    }

    return display;
  }

  renderHighlightedDisplay(display){
    const { query } = this.props;

    const i = display.toLowerCase().indexOf(query.toLowerCase());

    if(i === -1){
      return <span>{ display }</span>;
    }

    return (
      <span>
        { display.substring(0, i) }
        <b>
          { display.substring(i, i + query.length) }
        </b>
        { display.substring(i + query.length) }
      </span>
    );
  }
}

module.exports = Suggestion;