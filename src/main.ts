import './index.css';
import App from './components/App.svelte';
import Player from './components/Player.svelte';
import { mount } from 'svelte';

if (window.location.pathname.endsWith('/player')) {
  mount(Player, { target: document.getElementById('app')! });
} else {
  mount(App, { target: document.getElementById('app')! });
}
