const PropTypes = require(`prop-types`);
const React = require(`react`);

const Suggestion = require(`./Suggestion`);
const { countSuggestions, noop, getSuggestions } = require(`./utils`);

function translateValue(right, bottom){
  let applyTranslate = false;
  const translate = {
    y: 0,
    x: 0
  };

  if(right > window.innerWidth){
    applyTranslate = true;
    translate.x = `-100%`;
  }

  if(bottom > window.innerHeight){
    applyTranslate = true;
    translate.y = `-107%`;
  }

  if(applyTranslate){
    return `translate(${translate.x},${translate.y})`;
  }

  return ``;
}

class SuggestionsOverlay extends React.Component {
  static propTypes = {
    suggestions: PropTypes.object.isRequired,
    focusIndex: PropTypes.number,
    scrollFocusedIntoView: PropTypes.bool,
    onSelect: PropTypes.func,
    onMouseMove: PropTypes.func
  };

  static defaultProps = {
    suggestions: {},
    onSelect: noop,
    onMouseMove: noop
  };

  setDomRef = ::this.setDomRef;
  setDomRef(ref){
    this.domRef = ref;
  }

  render(){
    const { suggestions, onMouseDown, position } = this.props;

    // do not show suggestions until there is some data
    if(countSuggestions(suggestions) === 0){
      return null;
    }

    return <div class="mentions" style={position} onMouseDown={onMouseDown} ref={this.setDomRef}>
      {this.renderSuggestions()}
    </div>;
  }

  renderSuggestions(){
    return getSuggestions(this.props.suggestions).reduce(
      (result, { suggestions, descriptor }) => [
        ...result,

        ...suggestions.map((suggestion, index) => this.renderSuggestion(
          suggestion,
          descriptor,
          result.length + index
        ))
      ]
    , []);
  }

  renderSuggestion(suggestion, descriptor, index){
    const id = this.getID(suggestion);
    const isFocused = index === this.props.focusIndex;

    const { mentionDescriptor, query } = descriptor;

    return (
      <Suggestion
        key={ id }
        id={ id }
        query={ query }
        descriptor={ mentionDescriptor }
        suggestion={ suggestion }
        focused={ isFocused }
        onClick={this.select.bind(this, suggestion, descriptor)}
        onMouseMove={this.handleMouseMove.bind(this, index)} />
    );
  }

  componentDidUpdate(){
    const suggestions = this.domRef;
    if(!suggestions) return;

    suggestions.style.transform = ``;

    const rect = suggestions.getBoundingClientRect();

    const transform = suggestions.style.transform = translateValue(rect.right, rect.bottom);

    const topContainer = transform === `` ?
      rect.top :
      suggestions.getBoundingClientRect().top;

    if(suggestions.offsetHeight >= suggestions.scrollHeight || !this.props.scrollFocusedIntoView){
      return;
    }

    const scrollTop = suggestions.scrollTop;
    let { top, bottom } = suggestions.children[this.props.focusIndex].getBoundingClientRect();
    top = top - topContainer + scrollTop;
    bottom = bottom - topContainer + scrollTop;

    if(top < scrollTop){
      suggestions.scrollTop = top;
    }else if(bottom > suggestions.offsetHeight){
      suggestions.scrollTop = bottom - suggestions.offsetHeight;
    }
  }

  getID(suggestion){
    if(suggestion instanceof String){
      return suggestion;
    }

    return suggestion.id;
  }

  handleMouseMove(index){
    this.props.onMouseMove(index);
  }

  select(suggestion, descriptor){
    this.props.onSelect(suggestion, descriptor);
  }
}

export default SuggestionsOverlay;