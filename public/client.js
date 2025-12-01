// public/client.js
// Small helper functions used by publisher & viewer pages

// parse query string like ?room=room-abc
function parseQuery() {
  const q = {};
  location.search.replace(/^\?/, '').split('&').forEach(pair => {
    if (!pair) return;
    const [k, v] = pair.split('=');
    q[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return q;
}

// create socket and attach simple logging
function createSocket() {
  const socket = io(); // will connect to same origin
  socket.on('connect', () => console.log('socket connected', socket.id));
  socket.on('disconnect', () => console.log('socket disconnected'));
  socket.on('error', e => console.warn('socket error', e));
  return socket;
}

// format timestamp to time string
function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

/*
  Chat UI helper
  - mountPoint: DOM element to append the chat UI into (a container element)
  - onSend(message) -> function called when user sends a message. Should return true if sent.
  Returns an object with:
    .appendMessage({ username, message, ts, type }) // type: 'chat' | 'info'
    .setDisabled(bool)
*/
function createChatUI(mountPoint, opts = {}) {
  // structure:
  // <div class="chat">
  //   <ul class="chat-list"></ul>
  //   <div class="chat-input">
  //     <input />
  //     <button>Send</button>
  //   </div>
  // </div>
  const container = document.createElement('div');
  container.className = 'chat-container';
  container.style.maxWidth = opts.maxWidth || '380px';

  const list = document.createElement('ul');
  list.className = 'chat-list';
  list.style.listStyle = 'none';
  list.style.padding = '8px';
  list.style.height = opts.height || '220px';
  list.style.overflowY = 'auto';
  list.style.border = '1px solid #eee';
  list.style.background = '#fafafa';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'chat-input';
  inputWrap.style.display = 'flex';
  inputWrap.style.marginTop = '6px';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Type a message...';
  input.style.flex = '1';
  input.style.padding = '8px';

  const btn = document.createElement('button');
  btn.textContent = 'Send';
  btn.style.marginLeft = '6px';

  inputWrap.appendChild(input);
  inputWrap.appendChild(btn);
  container.appendChild(list);
  container.appendChild(inputWrap);
  mountPoint.appendChild(container);

  // keep scroll at bottom
  function scrollBottom() {
    list.scrollTop = list.scrollHeight;
  }

  function appendMessage({ username, message, ts, type = 'chat' }) {
    const li = document.createElement('li');
    li.style.padding = '6px 4px';
    li.style.borderBottom = '1px solid #fff';
    if (type === 'info') {
      li.style.color = '#555';
      li.style.fontStyle = 'italic';
      li.textContent = `[${fmtTime(ts)}] ${message}`;
    } else {
      const who = document.createElement('strong');
      who.textContent = username + ': ';
      const span = document.createElement('span');
      span.textContent = message;
      const time = document.createElement('div');
      time.textContent = fmtTime(ts);
      time.style.fontSize = '11px';
      time.style.color = '#888';
      li.appendChild(who);
      li.appendChild(span);
      li.appendChild(time);
    }
    list.appendChild(li);
    scrollBottom();
  }

  // send handler with basic validation
  let onSend = opts.onSend || (()=>false);
  btn.addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) return;
    if (typeof onSend === 'function') {
      const ok = onSend(text);
      if (ok !== false) { input.value = ''; }
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btn.click();
    }
  });

  return {
    appendMessage,
    setOnSend(fn) {
      if (typeof fn === 'function') onSend = fn;
    },
    setDisabled(v) {
      input.disabled = !!v;
      btn.disabled = !!v;
    }
  };
}

// simple client-side throttle: allow N messages per interval
function createRateLimiter({ tokens = 1, refillMs = 1000 } = {}) {
  let available = tokens;
  let lastRefill = Date.now();
  function refill() {
    const now = Date.now();
    if (now - lastRefill >= refillMs) {
      available = tokens;
      lastRefill = now;
    }
  }
  return {
    canSend() {
      refill();
      if (available > 0) {
        available -= 1;
        return true;
      }
      return false;
    }
  };
}
