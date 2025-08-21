import './index.css';
import App from './components/App.svelte';
import Renderer from './components/Renderer.svelte';
import { mount } from 'svelte';

const target = document.getElementById('app')!;
const params = new URLSearchParams(window.location.search);

switch (params.get('app')) {
  case 'renderer':
    mount(Renderer, { target });
    break;
  case 'view':
  default:
    mount(App, { target });
    break;
}
