// @flow

import React from 'react';
import shallowEqual from 'shallowequal';
import { debounce } from 'lodash';

import { createContext } from 'react-broadcast';
import immutagen from 'immutagen';

// export class GeneratorComponent extends React.Component {
//   constructor() {
//     super();
//
//     console.log(`this.render$:`, this.render$)
//   }
//
//   render() {
//     throw new Error(`This is meant to be overwritten by render$ of the child`)
//   }
// }

export let create_generator_component = (generator_fn) => {
  let { Provider, Consumer } = createContext();
  let immutable_generator = immutagen(generator_fn);

  let render_subchild = (generator, value) => {
    let { value: element, next: next_generator } = generator(value);
    return <Provider value={{ generator: next_generator }}>{element}</Provider>;
  };

  let YieldRender = (props) => {
    return render_subchild(immutable_generator, {
      props: props,
      resolve: (value) => {
        return (
          <Consumer>
            {({ generator }) => render_subchild(generator, value)}
          </Consumer>
        );
      },
    });
  };
  return YieldRender;
};

export let generator_render = (generator_fn) => {
  let { Provider, Consumer } = createContext();

  let render_subchild = (generator, value) => {
    let { value: element, next: next_generator } = generator(value);
    return <Provider value={{ generator: next_generator }}>{element}</Provider>;
  };

  function render() {
    let element_this = this || {
      get props() {
        throw new Error(`Trying to get this.props, but this render function is not bound to a react component :O`);
      },
      get state() {
        throw new Error(`Trying to get this.state, but this render function is not bound to a react component :O`);
      }
    };
    let bound_generator_fn = (...args) => generator_fn.call(element_this, ...args);
    let immutable_generator = immutagen(bound_generator_fn);
    let resolve = (value) => {
      return (
        <Consumer>
          {({ generator }) => render_subchild(generator, value)}
        </Consumer>
      );
    };
    return render_subchild(immutable_generator, resolve);
  };
  return render;
}

// Still not sure what I should call this
export class EmptyC extends React.Component {
  render() {
    return null;
  }
}

export class State extends React.Component {
  /*:flow
  props: {
    initialValue: any,
    children?: (value: any, update: (value: any) => void) => React$Element<*>,
  };
  */

  state = {
    thing: this.props.initialValue,
  };
  render() {
    if (!this.props.children) return;

    return this.props.children(this.state.thing, (valueOrFn) => {
      if (typeof valueOrFn === 'function') {
        this.setState((state) => {
          return { thing: valueOrFn(state.thing) };
        });
      } else {
        if (!shallowEqual(this.state.thing, valueOrFn)) {
          this.setState({ thing: valueOrFn });
        }
      }
    });
  }
}

export let GoodState = ({ initialValue, children, merge }) => {
  return (
    <State
      initialValue={initialValue}
      children={(state, set_state) =>
        children({
          state,
          set_state: merge
            ? (new_state) =>
                set_state((old_state) => {
                  return { ...old_state, ...new_state };
                })
            : set_state,
        })
      }
    />
  );
};

export class Compose extends React.Component {
  props: {
    [key: string]: (children: () => React$Element<*>) => React$Element<*>,
    children?: () => React$Element<*>,
  };

  render() {
    const { children, ...chain } = this.props;

    const entries = Object.entries(chain);
    const fn = entries.reduce((acc, [key, wrapFn]) => {
      // $FlowFixMe
      return (props) => wrapFn((value) => acc({ ...props, [key]: value }));
    }, (props) => (children ? children(props) : null));

    return fn();
  }
}

type TCleanUp = () => mixed;
export class Lifecycle extends React.Component {
  cleanup: ?TCleanUp;

  props: {
    componentDidMount?: () => TCleanUp | mixed,
    componentWillUnmount?: () => mixed,
  };

  componentDidMount() {
    if (this.props.componentDidMount) {
      let cleanup = this.props.componentDidMount();
      if (typeof cleanup === 'function') {
        this.cleanup = cleanup;
      }
    }
  }

  componentWillUnmount() {
    if (this.props.componentWillUnmount) this.props.componentWillUnmount();
    if (this.cleanup) this.cleanup();
  }

  render() {
    return this.props.children || null;
  }
}

type TOnChangeProps = {
  values: any,
  onUpdate: (props: any) => mixed,
};
export class OnChange<T: any> extends React.Component {
  props: TOnChangeProps;

  componentDidMount() {
    this.props.onUpdate(this.props.values);
  }

  componentDidUpdate(prevProps: TOnChangeProps) {
    if (!shallowEqual(prevProps.values, this.props.values)) {
      this.props.onUpdate(this.props.values);
    }
  }

  render() {
    return null;
  }
}

// TODO Add something that prevents page navigation (react router prompt?) while it is updating
export class BufferedField extends React.Component {
  /*:flow
  props<T>: {
    value: T,
    onCommit: (value: T) => mixed,
    commitEvery: number, // Milliseconds
    children: (value: T, set_value: (T) => mixed) => React$Element,
  }
  */

  state = {
    buffered_value: this.props.value,
    last_commited_value: this.props.value,
  };
  debounced_commit = debounce(() => {
    this.props.onCommit(this.state.buffered_value);
    this.setState({
      last_commited_value: this.state.buffered_value,
    });
  }, this.props.commitEvery);

  componentWillReceiveProps(nextProps) {
    if (nextProps.value !== this.state.last_commited_value) {
      this.setState({
        buffered_value: nextProps.value,
        last_commited_value: nextProps.value,
      });
    }
  }

  componentWillUnmount() {
    // Force the pending update
    this.debounced_commit.flush();
  }

  render() {
    return this.props.children(this.state.buffered_value, (new_value) => {
      this.setState({ buffered_value: new_value });
      this.debounced_commit();
    });
  }
}
