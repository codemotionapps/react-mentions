import PropTypes from 'prop-types';
import React from 'react';

import { areValuesEqual } from './utils';

export default class CaretFinder extends React.Component {
	static propTypes = {
		onCaretPositionChange: PropTypes.func.isRequired,
		value: PropTypes.string.isRequired,
		selectionStart: PropTypes.number.isRequired
	};

	state = {
		position: {}
	};

	updateCaretPosition(){
		// if(!this.caretRef) return;

		const { top, left } = this.caretRef.getBoundingClientRect();

		const position = {
			left,
			top
		};

		if(areValuesEqual(position, this.state.position)) return;

		this.setState({position});

		this.props.onCaretPositionChange(position);
	}

	setCaretRef = this.setCaretRef.bind(this);
	setCaretRef(ref){
		this.caretRef = ref;
	}

	render(){
		const { className, value, selectionStart } = this.props;

		return <div class={className}>
			{value && value.substring(0, selectionStart)}
			<span ref={this.setCaretRef}>{` `}</span>
		</div>;
	}

	shouldComponentUpdate(nextProps){
		return this.props.value !== nextProps.value ||
			this.props.className !== nextProps.className ||
			this.props.selectionStart !== nextProps.selectionStart;
	}

	componentDidMount(){
		this.updateCaretPosition();
	}

	componentDidUpdate(){
		this.updateCaretPosition();
	}
}