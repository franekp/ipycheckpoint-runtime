import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  ILabShell,
} from '@jupyterlab/application';

import { IDocumentManager } from '@jupyterlab/docmanager';
import { DocumentWidget, DocumentRegistry } from '@jupyterlab/docregistry';
import { ISharedNotebook, ISharedCell, SharedCell } from '@jupyter/ydoc';
import { Notebook, NotebookActions } from '@jupyterlab/notebook';
import { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';

function timeout(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

class NotebookController {
  private isEmpty: boolean = true;
  private nb: Notebook;

  constructor(public doc: DocumentWidget) {
    this.nb = doc.content as Notebook;
  }

  async _waitForKernel(): Promise<IKernelConnection> {
    while (true) {
      if (this.doc.context.sessionContext.session?.kernel) {
        return this.doc.context.sessionContext.session.kernel;
      }
      await timeout(100);
    }
  }

  private _addCell(cell: SharedCell.Cell): ISharedCell {
    const model = this.nb.model as DocumentRegistry.IModel;
    const sharedModel = model.sharedModel as ISharedNotebook;
    const res = sharedModel.addCell(cell);
    if (this.isEmpty) {
      // empty notebooks start with a single empty cell
      // if that's the case, we delete this cell after adding the first non-empty one
      NotebookActions.cut(this.nb);
      this.isEmpty = false;
    }
    return res;
  }

  async executeHidden(code: string): Promise<void> {
    const kernel = await this._waitForKernel();
    await kernel.requestExecute({code}).done;
  }

  async initWithCodeCells(cells: string[]): Promise<void> {
    const targetNumCells = this.nb.widgets.length - (this.isEmpty ? 1 : 0) + cells.length;
    for (const cell_code of cells) {
      this._addCell({cell_type: 'code', source: cell_code});
    }
    while (this.nb.widgets.length < targetNumCells) {
      await timeout(100);
    }
  }

  async runAllCells(): Promise<void> {
    await NotebookActions.runAll(this.nb, this.doc.context.sessionContext);
  }
}

type Message =
  | { kind: 'IFrameToHost', type: 'InitialPayloadRequest' }
  | { kind: 'HostToIFrame', type: 'InitialPayloadResponse', envInitializer: string, initialCells: string[] }
  | { kind: 'IFrameToHost', type: 'NotebookReady' }
  | { kind: 'IFrameToHost', type: 'HeightUpdated', height: number }
  | { kind: 'HostToIFrame', type: 'ScrollUpdated', scrollTop: number }

function waitForMessage<T extends Message['type']>(targetWindow: Window, type: T): Promise<Message & {type: T}> {
  return new Promise(resolve => {
    const handleMessage = (event: MessageEvent<Message>) => {
      const data = event.data;
      if (data.type === type) {
        console.log(`IFRAME: '${type}' received! initializing...`);
        targetWindow.removeEventListener('message', handleMessage);
        resolve(data as any);  // apparently generic type refinement is too much for TypeScript
      } else {
        console.log(`IFRAME: unknown message '${type}' received!`);
      }
    };
    targetWindow.addEventListener('message', handleMessage);
  })
}

/**
 * Initialization data for the ipycheckpoint-runtime extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'ipycheckpoint-runtime:plugin',
  description: 'ipycheckpoint Runtime Initializer',
  autoStart: true,
  requires: [ILabShell, IDocumentManager],
  activate: (jupyterFrontEnd: JupyterFrontEnd, ilabshell: ILabShell, idocumentmanager: IDocumentManager) => {
    console.log('JupyterLab extension ipycheckpoint-runtime is activated!');
    (window as any).jupyter_frontend = jupyterFrontEnd;
    (window as any).ilabshell = ilabshell;
    (window as any).idocumentmanager = idocumentmanager;

    (async () => {
      setupHeightUpdates();
      setupStickyToolbar();
      await timeout(300);  // ILabShell needs some time to initialize...
      ilabshell.collapseLeft();
      ilabshell.collapseRight();
      ilabshell.toggleSideTabBarVisibility("left");
      ilabshell.toggleSideTabBarVisibility("right");
      ilabshell.mode = 'single-document';

      const doc = idocumentmanager.createNew('Ephemeral client-side notebook.ipynb', 'default', {name: 'python'});

      if (!doc || !(doc instanceof DocumentWidget)) {
        return;
      }

      (window as any).doc = doc;
      (window as any).Notebook = Notebook;
      (window as any).NotebookActions = NotebookActions;

      const nb = new NotebookController(doc);

      setTimeout(ProgressBar.show, 3000);
      console.log(`IFRAME: sending 'InitialPayloadRequest' ...`);
      window.parent.postMessage({ kind: 'IFrameToHost', type: 'InitialPayloadRequest' }, '*');
      const payload = await waitForMessage(window, 'InitialPayloadResponse');

      await nb.executeHidden(payload.envInitializer);
      ProgressBar.hide();

      await nb.initWithCodeCells(payload.initialCells);
      window.parent.postMessage({ kind: 'IFrameToHost', type: 'NotebookReady' }, '*');
      await nb.runAllCells();
    })();
  }
};

export default plugin;

function setupStickyToolbar() {
  const style = document.createElement('style');
  style.innerHTML = `
    .jp-Toolbar.jp-NotebookPanel-toolbar, #jp-menu-panel, #jp-top-panel {
      transition: all 350ms ease-out;
    }
  `;
  document.head.appendChild(style);

  let currentScrollTop = 0;

  const recentDeltas = [0, 0, 0, 0, 0];

  const applyOffsets = (transition: string) => {
    const scrollTop = currentScrollTop;
    const toolbar = document.querySelector<HTMLElement>('.jp-Toolbar.jp-NotebookPanel-toolbar');
    if (toolbar) {
      toolbar.style.transition = transition;
      toolbar.style.top = `${scrollTop}px`;
    }
    const menu = document.querySelector<HTMLElement>('#jp-menu-panel');
    const baselineTopOffsetForMenu = 28;
    if (menu) {
      menu.style.transition = transition;
      menu.style.top = `${baselineTopOffsetForMenu + scrollTop}px`;
    }
    const titlebar = document.querySelector<HTMLElement>('#jp-top-panel');
    const baselineHeightForTitlebar = 28;
    if (titlebar) {
      titlebar.style.transition = transition;
      titlebar.style.paddingTop = `${scrollTop}px`;
      titlebar.style.height = `${baselineHeightForTitlebar + scrollTop}px`;
      // it is already border-box, but we depend on it so better to set to be more robust to changes
      titlebar.style.boxSizing = 'border-box';
      titlebar.style.zIndex = '5';
    }
  }

  const handler = (event: MessageEvent<Message>) => {
    const data = event.data;
    if (data.type != 'ScrollUpdated') { return }
    const scrollTop = Math.max(0, data.scrollTop);

    const delta = Math.abs(currentScrollTop - scrollTop);
    currentScrollTop = scrollTop;
    recentDeltas.shift();
    recentDeltas.push(delta);
    const maxDelta = Math.max(...recentDeltas);
    applyOffsets('all 1500ms ease-out');
  }

  window.addEventListener('message', handler);

  const restoreNormalTransitionImpl = () => {
    currentScrollTop += 0.01;
    applyOffsets('all 200ms ease-out');
  };
  const restoreNormalTransition = debounce(restoreNormalTransitionImpl, 200);

  window.addEventListener('message', (event: MessageEvent<Message>) => {
    const data = event.data;
    if (data.type != 'ScrollUpdated') { return }
    restoreNormalTransition();
  })
}

async function setupHeightUpdates() {
  // source: https://blog.codeminer42.com/enhancing-user-experience-with-dynamic-iframe-height/

  let currentDocumentHeight = 0;

  const sendMessageUpdatingHeight = (height: number) => {
    window.parent.postMessage({ kind: 'IFrameToHost', type: 'HeightUpdated', height }, '*');
  };

  const handleDocumentMutation = () => {
    const contentInsideScroll = document.querySelector('.jp-WindowedPanel-viewport');
    const fixedSizeScrollContainer = document.querySelector('.jp-WindowedPanel-outer');
    if (!contentInsideScroll) { return }
    if (!fixedSizeScrollContainer) { return }

    const toolbarHeight = contentInsideScroll.getBoundingClientRect().y + fixedSizeScrollContainer.scrollTop;
    const statusBarHeight = 24;
    const additionalSpace = 60;
    const totalHeight = contentInsideScroll.scrollHeight + toolbarHeight + statusBarHeight + additionalSpace;

    if (totalHeight && totalHeight !== currentDocumentHeight) {
      currentDocumentHeight = totalHeight;
      sendMessageUpdatingHeight(totalHeight);
    }
  };

  const style = document.createElement('style');
  style.innerHTML = `
    .jp-WindowedPanel-outer::after { display: none !important; }
    .jp-Notebook-footer { margin-top: 10px; }
  `;
  document.head.appendChild(style);

  const observer = new MutationObserver(handleDocumentMutation);

  let contentInsideScroll: any = null;
  let fixedSizeScrollContainer: any = null;
  while (!contentInsideScroll || !fixedSizeScrollContainer) {
    await timeout(100);
    contentInsideScroll = document.querySelector('.jp-WindowedPanel-viewport');
    fixedSizeScrollContainer = document.querySelector('.jp-WindowedPanel-outer');
  }

  observer.observe(contentInsideScroll, {
    subtree: true,
    attributes: true,
    childList: true,
    characterData: true
  });
  observer.observe(fixedSizeScrollContainer, {
    subtree: true,
    attributes: true,
    childList: true,
    characterData: true
  });
}

function debounce(func: any, wait: any) {
  let timeout: any;

  return function() {
    let context = this,
      args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(function() {
      timeout = null;
      func.apply(context, args);
    }, wait);
  }
}

namespace ProgressBar {
  const getHtml = (id: string, eta: number, description: string) => `
    <style>
      #${id} {
        z-index: 900;
        position: absolute;
        left: 0px; top: 0px;
        right: 0px; bottom: 0px;

        background: rgba(0, 0, 0, 0.5);
        color: white;
      }

      #${id} .loading-bar-wrapper, #${id} {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }

      #${id} .loading-bar-wrapper {
        padding: 20px;
        background: rgb(50, 50, 50);
      }

      #${id} .loading-bar-container {
          width: 400px;
          height: 30px;
          border: 4px solid white;
          margin: 20px;
          background: transparent;
          position: relative;
          overflow: hidden;
          padding: 4px;
      }

      #${id} .loading-bar {
          width: 100px;
          height: 100%;
          background: white;
          position: relative;
          animation: variableDeserialization ${eta}s infinite alternate ease-in-out;
      }

      #${id} .description {
        font-size: 18px;
      }

      @keyframes variableDeserialization {
          0% { left: 0px; }
          100% { left: 300px; }
      }
    </style>

    <div id="${id}">
      <div class="loading-bar-wrapper">
        <div class="loading-bar-container">
            <div class="loading-bar"></div>
        </div>
        <div class="description">
          ${description}
        </div>
      </div>
    </div>
  `;

  export function show() {
    const description = "Deserializing inherited variables";
    document.body.insertAdjacentHTML('beforeend', getHtml('deserialize-inherited-variables', 2, description));
  }

  export function hide() {
    (((document.querySelector('#deserialize-inherited-variables') || {}) as any).style || {}).display = 'none';
  }
}
