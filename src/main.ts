import './index.css';
import App from './components/App.svelte';
import Player from './components/Player.svelte';
import Renderer from './components/Renderer.svelte';
import { mount } from 'svelte';

const target = document.getElementById('app')!;

if (window.location.pathname.endsWith('/renderer')) {
  mount(Renderer, { target });
} else if (window.location.pathname.endsWith('/player')) {
  mount(Player, { target });
} else {
  mount(App, { target });
}
