import React, { Component } from 'react';
import { Router, Link, Match, Location } from '@reach/router';
import { throttle, unescape, debounce } from 'lodash';
import zango from 'zangodb';
import AutosizeInput from 'react-input-autosize';
import $ from 'jquery';
import styled from 'styled-components';

import './App.css';
import { BufferedField } from './Metacomponents.js';
import { DocumentEvent } from './DocumentEvent.js';

// NOTE Reddit apis
// Base documentation
// - https://www.reddit.com/dev/api
// Search for posts of a given url
// - https://www.reddit.com/api/info.json?url=https://google.com
// Get information about a given subreddit
// - https://www.reddit.com/r/mapporn/about.json
// Get information about a comma-separated list of "names"
// - https://www.reddit.com/by_id/t3_862uxs.json

let db = new zango.Db('mydb', {
  favorites: ['url'],
  hidden_posts: ['url'],
});
let favorites_db = db.collection('favorites');
let hidden_db = db.collection('hidden_posts');

let IMGUR_CLIENT_ID = 'a2657fbb95b9063';
let HEADER_OFFSET = 65;

class HideIfNotCool extends React.Component {
  state = {
    is_hidden: true,
  };

  async componentDidMount() {
    let { entry } = this.props;

    let result = await hidden_db.findOne({
      url: entry.url,
    });
    if (result == null) {
      this.setState({ is_hidden: false });
    }
  }

  render() {
    let { children, entry } = this.props;
    let { is_hidden } = this.state;

    if (is_hidden) {
      return null;
    } else {
      return children(() => {
        this.setState({ is_hidden: true });
        hidden_db.insert({
          url: entry.url,
        });
      });
    }
  }
}

let onscroll_to_end = (offset, fn) => (e) => {
  let element = e.target.documentElement || e.target;

  if (element.scrollHeight !== element.clientHeight) {
    if (
      element.scrollTop + element.clientHeight >
      element.scrollHeight - offset
    ) {
      fn();
    }
  }

  if (element.scrollWidth !== element.clientWidth) {
    if (
      element.scrollLeft + element.clientWidth >
      element.scrollWidth - offset
    ) {
      fn();
    }
  }
};

let UrlStyle = styled.div`
  font-family: 'Lucida Console', Monaco, monospace;
  background-color: #043643;
  color: #1b89d5;
  padding: 6px;
  padding-left: 16px;
  padding-right: 16px;
  margin-left: -16px;
  margin-right: -16px;
  font-size: 14px;
  border-radius: 3px;
  margin-top: 16px;
  margin-bottom: 16px;
`;
let TechnicalUrl = ({ url }) => {
  return <UrlStyle>{url}</UrlStyle>;
};

class Image extends React.Component {
  state = {
    loading_state: 'loading',
    expanded: false,
  };
  render() {
    let { src, alt } = this.props;
    let { loading_state, expanded } = this.state;

    if (loading_state === 'error') {
      return (
        <div style={{ marginTop: 16 }}>
          <div>Image '{alt}' failed to load</div>
          <TechnicalUrl url={src} />
        </div>
      );
    }

    return (
      <img
        src={src}
        onClick={() => {
          if (loading_state === 'success') {
            this.setState({ expanded: !expanded });
          }
        }}
        style={{
          maxWidth: '100%',
          height: 'auto',
          maxHeight: expanded ? undefined : '80vh',
          backgroundColor: '#eee',
          display: 'inline-block',
          minWidth: loading_state === 'loading' ? '50%' : undefined,
          objectFit: 'contain',
        }}
        onError={(e) => {
          this.setState({ loading_state: 'error' });
        }}
        onLoad={(e) => {
          this.setState({ loading_state: 'success' });
        }}
        alt={alt}
        onDragStart={(e) => {
          let ext = src.match(/\.([a-zA-Z0-9]+)$/);
          if (ext != null) {
            e.dataTransfer.setData('DownloadURL', [
              `application/octet-stream:${alt}.${ext[1]}:${src}`,
            ]);
          }
        }}
      />
    );
  }
}

let Gif = ({ src, alt }) => {
  return <Image src={src} alt={alt} />
}

class VideoLoop extends React.Component {
  state = {
    playing: false,
    status: 'idle',
  };

  videoref = null;

  componentDidUpdate(prevProps, prevState) {
    if (prevState.playing !== this.state.playing) {
      if (this.state.playing) {
        if (this.videoref.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
          this.videoref.play().catch(() => {});
        }
      } else {
        this.videoref.pause();
      }
    }
  }

  render() {
    let { src, title, children } = this.props;
    let { playing, status } = this.state;

    let source_urls = [
      ...(src ? [src] : []),
      ...(children || []).map((x) => x.props.src),
    ];

    if (status === 'error') {
      return (
        <div style={{ marginTop: 16 }}>
          <div>Video failed to load</div>
          {source_urls.map((url, i) => <TechnicalUrl key={i} url={url} />)}
        </div>
      );
    }

    return (
      <div
        onMouseEnter={(e) => {
          this.setState({ playing: true, status: 'waiting' });
        }}
        onMouseLeave={(e) => {
          this.setState({ playing: false, status: 'idle' });
        }}
      >
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <video
            ref={(ref) => (this.videoref = ref)}
            style={{
              height: 'auto',
              maxHeight: '80vh',
              minHeight: '50vh',
              maxWidth: '100%',
              backgroundColor: '#fafafa',
            }}
            onPlaying={() => {
              console.log('PLAYING');
              this.setState({ status: 'playing' });
            }}
            preload={playing}
            onCanPlayThrough={() => {
              if (playing) {
                this.videoref.play().catch(() => {});
              }
            }}
            muted
            // onLoadedData={() => {
            //   if (this.videoref.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
            //   }
            // }}
            onError={(e) => {
              if (
                this.videoref.networkState ===
                HTMLMediaElement.NETWORK_NO_SOURCE
              ) {
                this.setState({ status: 'error' });
              } else {
                console.log(`e:`, e.nativeEvent);
              }
            }}
            onWaiting={(e) => {
              this.videoref.pause();
              this.setState({ status: 'waiting' });
            }}
            src={src}
            loop
            children={children}
          />

          <div
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                transition: 'opacity .2s',
                opacity: playing ? 0 : 1,
                borderRadius: 3,
                padding: 5,
                paddingLeft: 14,
                paddingRight: 14,
                backgroundColor: 'rgba(255, 255, 255, 1)',
                boxShadow: `0px 1px 2px #0000008c`,
              }}
            >
              Play
            </div>
          </div>

          <div
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                transition: 'opacity .2s',
                opacity: status === 'waiting' ? 1 : 0,
                borderRadius: 3,
                padding: 5,
                paddingLeft: 14,
                paddingRight: 14,
                backgroundColor: 'rgba(255, 255, 255, 1)',
                boxShadow: `0px 1px 2px #0000008c`,
              }}
            >
              Loading..
            </div>
          </div>
        </div>
      </div>
    );
  }
}

class Deviantart extends React.Component {
  state = {
    info: null,
  };

  async componentDidMount() {
    let { url } = this.props;
    let CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';
    let response = await fetch(
      `${CORS_PROXY}https://backend.deviantart.com/oembed?url=${encodeURIComponent(
        url
      )}`
    );
    let json = await response.json();
    this.setState({ info: json });
  }

  render() {
    let { title } = this.props;
    let { info } = this.state;

    if (info == null) {
      return <div>Loading Deviantart..</div>;
    }

    return <Image src={info.url} title={title} />;
  }
}

class ImgurAlbum extends React.Component {
  state = {
    album: null,
    limit: 5,
  };

  async componentDidMount() {
    let { id, type = 'album' } = this.props;
    let response = await fetch(`https://api.imgur.com/3/${type}/${id}`, {
      headers: {
        Authorization: `Client-ID ${IMGUR_CLIENT_ID}`,
      },
    });
    let json = await response.json();
    this.setState({ album: json.data });
  }

  render() {
    let { title } = this.props;
    let { album, limit } = this.state;

    if (album == null) {
      return <div>Loading imgur album..</div>;
    }

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          maxWidth: '100%',
          overflow: 'auto',
        }}
        onScroll={onscroll_to_end(
          500,
          throttle(() => {
            this.setState({ limit: limit + 5 });
          }, 1000)
        )}
      >
        {album.images.slice(0, limit).map((image, index) => (
          <React.Fragment key={index}>
            <Content
              url={image.link}
              title={`${title} ${image.title || index}`}
            />
            <div style={{ minWidth: 20 }} />
          </React.Fragment>
        ))}

        {album.images.length > limit && (
          <div
            style={{
              cursor: 'pointer',
              minWidth: 200,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              color: '#999',
              fontWeight: 300,
              fontSize: 16,
            }}
            onClick={() => {
              this.setState({ limit: limit + 5 });
            }}
          >
            <div style={{ color: 'black' }}>Load more</div>
            <div>({album.images.length - limit} left)</div>
          </div>
        )}
      </div>
    );
  }
}

let Content = ({ url, title }) => {
  let imgurlalbum_match = url.match(/^https?:\/\/imgur.com\/a\/(.*)$/);
  if (imgurlalbum_match) {
    return <ImgurAlbum type="album" id={imgurlalbum_match[1]} title={title} />;
  }

  let vreddit_match = url.match(/^https?:\/\/v.redd.it\/(.*)$/);
  if (vreddit_match) {
    return (
      <VideoLoop src={`https://v.redd.it/${vreddit_match[1]}/DASH_600_K`} />
    );
  }

  let imgurlgallery_match = url.match(/^https?:\/\/imgur.com\/gallery\/(.*)$/);
  if (imgurlgallery_match) {
    return (
      <ImgurAlbum type="gallery" id={imgurlgallery_match[1]} title={title} />
    );
  }

  var quickmeme_match = url.match(/(?:qkme\.me|quickmeme\.com\/meme)\/(\w*)/);
  if (quickmeme_match) {
    return (
      <Image src={`http://i.qkme.me/${quickmeme_match[1]}.jpg`} alt={title} />
    );
  }

  var livememe_match = url.match(/(?:livememe\.com)\/(\w*)/);
  if (livememe_match) {
    return (
      <Gif
        src={`http://ai1.livememe.com/${livememe_match[1]}.gif`}
        alt={title}
      />
    );
  }

  let gifcat = url.match(/^https?:\/\/gfycat.com\/(?:.*\/)?([^/]*)$/);
  if (gifcat) {
    return (
      <VideoLoop>
        <source
          src={`https://giant.gfycat.com/${gifcat[1]}.webm`}
          type="video/webm"
        />
        <source
          src={`https://zippy.gfycat.com/${gifcat[1]}.webm`}
          type="video/webm"
        />
        <source
          src={`https://fat.gfycat.com/${gifcat[1]}.webm`}
          type="video/webm"
        />
        <source
          src={`https://far.gfycat.com/${gifcat[1]}.mp4`}
          type="video/mp4"
        />
      </VideoLoop>
    );
  }

  let imgurimage_match = url.match(
    /^https?:\/\/(?:i\.|m\.)?imgur.com\/([^/.]+)$/
  );
  if (imgurimage_match) {
    return (
      <Image
        src={`https://i.imgur.com/${imgurimage_match[1]}.jpg`}
        alt={title}
      />
    );
  }

  let imgurgifv_match = url.match(
    /^https?:\/\/(?:i|m).imgur.com\/(.*)\.(gifv|mp4)$/
  );
  if (imgurgifv_match) {
    return (
      <VideoLoop
        src={`https://i.imgur.com/${imgurgifv_match[1]}.mp4`}
        title={title}
      />
    );
  }

  let deviantart_match =
    url.match(/^https:\/\/www.deviantart.com\/(.*)\/art\/(.*)$/) ||
    url.match(/^http:\/\/fav.me\/(.*)$/);
  if (deviantart_match) {
    return <Deviantart url={url} title={title} />;
  }

  let youtube_match =
    url.match(/^https:\/\/youtu.be\/(.*)$/) ||
    url.match(/^https:\/\/www.youtube.com\/watch\?v=(.*)$/);
  if (youtube_match) {
    return (
      <div>
        <iframe
          allowfullscreen
          style={{
            width: '89vh',
            height: '50vh',
            maxWidth: '100%',
            border: 'none',
          }}
          src={`https://www.youtube.com/embed/${youtube_match[1]}`}
        />
      </div>
    );
  }

  if (url.match(/\.(jpg|jpeg|png|gif)(?:\?[^/]*)?$/)) {
    return <Image src={url} alt={title} />;
  }

  if (url.match(/\.gif(?:\?[^/]*)?$/)) {
    return <Gif src={url} alt={title} />;
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div>No match found for</div>
      <TechnicalUrl url={url} />
    </div>
  );
};

class FavoriteStar extends React.Component {
  state = {
    is_favorite: null,
  };

  async componentDidMount() {
    let { entry } = this.props;

    let match = await favorites_db.findOne({
      url: entry.url,
    });

    if (match) {
      this.setState({
        is_favorite: true,
      });
    } else {
      this.setState({
        is_favorite: false,
      });
    }
  }

  render() {
    let { is_favorite } = this.state;
    let { entry } = this.props;

    if (is_favorite == null) {
      return <div style={{ display: 'inline-block' }}>Loading</div>;
    }

    if (is_favorite === false) {
      return (
        <div
          style={{ display: 'inline-block', cursor: 'pointer' }}
          onClick={() => {
            this.setState({ is_favorite: true });
            favorites_db.insert({
              reddit_name: entry.name,
              subreddit: entry.subreddit,
              url: entry.url,
            });
          }}
        >
          Favorite
        </div>
      );
    }

    if (is_favorite === true) {
      return (
        <div
          onClick={() => {
            this.setState({ is_favorite: false });
            favorites_db.remove({
              url: entry.url,
            });
          }}
          style={{
            cursor: 'pointer',
            display: 'inline-block',
            paddingLeft: 10,
            paddingRight: 10,
            backgroundColor: 'rgb(175, 0, 65)',
            borderRadius: 3,
            color: 'white',
          }}
        >
          Favorite
        </div>
      );
    }
  }
}

class SubredditContent extends React.Component {
  state = {
    entries: [],
  };

  async componentDidMount() {
    let { subreddit, suffix = '', t = '' } = this.props;
    let { entries } = this.state;

    let after = entries[entries.length - 1]
      ? entries[entries.length - 1].data.name
      : '';
    let response = await fetch(
      `https://www.reddit.com/r/${subreddit}/${suffix}.json?t=${t}&limit=25&after=${after}`
    );
    let json = await response.json();

    this.setState({
      entries: [...entries, ...(json.data ? json.data.children : [])],
    });
  }

  render() {
    let { subreddit, suffix = '', t = '' } = this.props;
    let { entries } = this.state;

    let filter_periods = ['hour', 'day', 'week', 'month', 'year', 'all'];
    if (!['', ...filter_periods].includes(t)) {
      return (
        <div className="container">
          <div style={{ minHeight: 50 }} />
          <div className="fancy-text">
            You entered '{t}' as period, which is invalid
          </div>
        </div>
      );
    }

    let scroll_to_post = throttle((element) => {
      if (element == null) {
        return;
      }

      let { top } = $(element).offset();

      element.focus({
        preventScroll: true,
      });
      window.scroll({
        top: top - HEADER_OFFSET,
        left: 0,
        behavior: 'smooth',
      });
    }, 500);

    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <DocumentEvent
          name="scroll"
          handler={onscroll_to_end(
            2000,
            throttle(async () => {
              this.componentDidMount();
            }, 2000)
          )}
          passive
        />

        <DocumentEvent
          name="keydown"
          handler={(e) => {
            // TODO Other fields that can "steal" focus?
            if (
              document.activeElement &&
              document.activeElement.tagName === 'INPUT'
            ) {
              return;
            }

            if (e.which === 32) {
              // Spacebar
              e.preventDefault();
              let el = e.repeat
                ? document.activeElement
                : document.elementFromPoint(
                    window.innerWidth / 2,
                    HEADER_OFFSET + 10
                  );

              let $el = $(el);
              let $post = $el.closest('.reddit-post');
              let $next_post = e.shiftKey ? $post.prev() : $post.next();
              scroll_to_post($next_post[0]);
            }
          }}
          passive
        />

        {entries.map((entry, index) => (
          <HideIfNotCool key={index} entry={entry.data}>
            {(hide) => (
              <div
                onKeyUp={(e) => {
                  if (e.which === 72) {
                    e.preventDefault();
                    let next_post = $(e.currentTarget).next();
                    hide();
                    setTimeout(() => {
                      scroll_to_post(next_post[0]);
                    }, 100);
                  }
                }}
                tabIndex="-1"
                className="reddit-post"
                style={{
                  outline: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <a
                  className="fancy-text"
                  href={entry.data.url}
                  target="_blank"
                  title={entry.data.title}
                  style={{
                    fontSize: 35,
                    fontWeight: 300,
                  }}
                >
                  {unescape(entry.data.title)}
                </a>
                <div style={{ height: 5 }} />

                <div style={{ fontWeight: '400', fontSize: 13, color: '#999' }}>
                  <span
                    onClick={() => {
                      hide();
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    Hide
                  </span>
                  {' | '}
                  <FavoriteStar entry={entry.data} />
                  {' | '}
                  {entry.data.score} points{' | '}
                  {entry.data.domain}
                  {' | '}
                  {entry.data.name}
                </div>
                <div style={{ height: 10 }} />
                <div>
                  <Content
                    url={entry.data.url}
                    title={unescape(entry.data.title)}
                  />
                </div>

                <div style={{ height: 40 }} />
                <div style={{ height: 1, backgroundColor: '#ccc' }} />
                <div style={{ height: 20 }} />
              </div>
            )}
          </HideIfNotCool>
        ))}
      </div>
    );
  }
}

let Home = () => {
  return (
    <div className="container">
      <div style={{ minHeight: 50 }} />
      <div style={{ fontSize: 24 }}>Did you mean</div>
      <div style={{ minHeight: 50 }} />
      <div className="fancy-text">
        <Link to="/r/mapporn">/r/MapPorn</Link>
      </div>
      <div className="fancy-text">
        <Link to="/r/ShowerThoughts">/r/ShowerThoughts</Link>
      </div>
      <div className="fancy-text">
        <Link to="/r/Aww">/r/Aww</Link>
      </div>
      <div className="fancy-text">
        <Link to="/r/ChildrenFallingOver">/r/ChildrenFallingOver</Link>
      </div>
    </div>
  );
};

let Subreddit = ({ subreddit, '*': rest, navigate }) => {
  return (
    <div className="container">
      <div
        style={{
          position: 'fixed',
          zIndex: 10,
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: 'rgba(255,255,255,.96)',
        }}
      >
        <div className="container">
          <div style={{ borderTop: `4px solid #000` }} />

          <div style={{ height: 20 }} />
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <div
              className="fancy-text"
              style={{
                fontSize: 18,
              }}
            >
              <span>/r/</span>
              <BufferedField
                value={subreddit}
                commitEvery={1000}
                onCommit={(new_value) => {
                  navigate(`../${new_value}/${rest}`);
                }}
              >
                {(value, set_value) => (
                  <AutosizeInput
                    className="noselection"
                    extraWidth={5}
                    spellCheck={false}
                    inputStyle={{
                      fontSize: 'inherit',
                      fontFamily: 'inherit',
                      color: 'inherit',
                      border: 'none',
                      outline: 'none',
                      background: 'none',
                    }}
                    value={value}
                    onChange={(e) =>
                      set_value(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))
                    }
                    onFocus={(e) => {
                      e.target.select();
                    }}
                  />
                )}
              </BufferedField>
              <span style={{ color: '#999' }}>
                {rest === '' ? '' : `/${rest}`}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'row' }}>
              {['hot', 'top/all', 'top/week', 'new'].map((path) => (
                <Match exact key={path} path={path}>
                  {({ match, ...props }) =>
                    match ? null : (
                      <Link
                        to={`./${path}`}
                        className="fancy-text"
                        style={{
                          marginLeft: 20,
                          fontSize: 18,
                          color: '#999',
                        }}
                      >
                        {path}
                      </Link>
                    )
                  }
                </Match>
              ))}
            </div>
          </div>
          <div style={{ height: 20 }} />
        </div>
      </div>

      <div style={{ height: HEADER_OFFSET }} />

      <Location>
        {({ location }) => (
          <Router location={location} key={location.key}>
            <SubredditContent path="/" subreddit={subreddit} suffix="" />
            <SubredditContent path="hot" subreddit={subreddit} suffix="hot" />
            <SubredditContent path="new" subreddit={subreddit} suffix="new" />
            <SubredditContent
              path="top"
              subreddit={subreddit}
              suffix="top"
              t="all"
            />
            <SubredditContent
              path="top/:t"
              subreddit={subreddit}
              suffix="top"
            />
            <SubredditContent
              path="controversial"
              subreddit={subreddit}
              suffix="controversial"
              t="all"
            />
            <SubredditContent
              path="controversial/:t"
              subreddit={subreddit}
              suffix="controversial"
            />
          </Router>
        )}
      </Location>
    </div>
  );
};

let App = () => {
  return (
    <Router>
      <Home default path="/" />
      <Subreddit path="r/:subreddit/*" />
    </Router>
  );
};

export default App;
