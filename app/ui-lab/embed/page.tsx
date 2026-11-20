import EmbedClient from './embed-client';

export default async function UiLabEmbedPage({ searchParams }: { searchParams: Promise<{ theme?: string; view?: string }> }) {
  const params = await searchParams;
  const theme = params.theme === 'dark' ? 'dark' : 'light';
  const view = params.view === 'chips' || params.view === 'picker-open' ? params.view : 'picker';
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: `document.documentElement.setAttribute('data-theme',${JSON.stringify(theme)});document.documentElement.style.colorScheme=${JSON.stringify(theme)};` }} />
      <EmbedClient theme={theme} view={view} />
    </>
  );
}
