import { AppPlugin } from '@grafana/data';
import { ViewportAppJsonData } from './types';
import { AppConfig } from './components/AppConfig';

export const plugin = new AppPlugin<ViewportAppJsonData>().addConfigPage({
  title: 'Configuration',
  icon: 'cog',
  body: AppConfig,
  id: 'configuration',
});
