import './index.css';
import View from './components/View.svelte';
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
    mount(View, { target });
    break;
}
