import React from 'react';
import PropTypes from 'prop-types';

const { noop } = require(`./utils`);

// const styled = defaultStyle({
//   fontWeight: "inherit"
// });

const Mention = ({ display, style }) => <strong {...style}>{display}</strong>;

Mention.propTypes = {
  /**
   * Called when a new mention is added in the input
   *
   * Example:
   *
   * ```js
   * function(id, display) {
   *   console.log("user " + display + " was mentioned!");
   * }
   * ```
   */
  onAdd: PropTypes.func,
  onRemove: PropTypes.func,

  renderSuggestion: PropTypes.func.isRequired,

  trigger: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.instanceOf(RegExp)
  ]),

  isLoading: PropTypes.bool
};

Mention.defaultProps = {
  trigger: `@`,

  onAdd: noop,
  onRemove: noop,
  isLoading: false,
  appendSpaceOnAdd: false
};

module.exports = Mention;