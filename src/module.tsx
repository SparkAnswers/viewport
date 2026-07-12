import { AppPlugin } from '@grafana/data';
import { ViewportAppJsonData } from './types';
import { AppConfig } from './components/AppConfig';
import { RootPage } from './pages/RootPage';

export const plugin = new AppPlugin<ViewportAppJsonData>().setRootPage(RootPage).addConfigPage({
  title: 'Configuration',
  icon: 'cog',
  body: AppConfig,
  id: 'configuration',
});
