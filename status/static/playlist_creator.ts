import { library } from "./library.ts";
import {
  ExtendsBrickJson,
  isExtendsBrickJson,
  LayoutConfig,
} from "../../server/playlist/playlist.ts";
import Sortable from "https://esm.sh/sortablejs@1.15.0";
import {
  CreditAuthorTitleJson,
  CreditImageJson,
  CreditJson,
} from "../../client/title_card.ts";

function makeEditableText(
  el: HTMLElement,
  getFn: () => string,
  setFn: (d: string) => void,
) {
  el.textContent = getFn();
  el.addEventListener("dblclick", () => {
    el.contentEditable = "true";
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    el.focus();
  });
  el.addEventListener("keydown", (e) => {
    if (e.keyCode == 13) {
      window.getSelection()!.removeAllRanges();
      el.blur();
    }
  });
  el.addEventListener("blur", () => {
    const v = Number(el.textContent);
    if (!Number.isNaN(v)) {
      setFn(String(v));
    }
    el.contentEditable = "false";
    el.textContent = getFn();
  });
}

function getDate() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60 * 1000).toISOString().split("T")[0];
}

export class PlaylistCreator {
  playlist: LayoutConfig[] = [];
  livePlaylist: LayoutConfig[] | null = null;
  constructor(
    readonly container: HTMLElement,
    readonly applyPlaylistFn: (playlist: LayoutConfig[] | "reset") => void,
  ) {
    this.container = container;
    this.applyPlaylistFn = applyPlaylistFn;
    this.getElement("#close-creator")
      .addEventListener("click", () => this.close());
    this.getElement("#reset-playlist")
      .addEventListener("click", () => this.resetPlaylist());
    this.getElement("#apply-playlist")
      .addEventListener("click", () => this.applyPlaylist());
    this.getElement("#clear-playlist")
      .addEventListener("click", () => this.clearPlaylist());
    this.getElement("#load-live")
      .addEventListener("click", () => this.loadLivePlaylist());
    this.getElement("#load-all")
      .addEventListener("click", () => this.loadAll());
    this.getElement("#new-layout")
      .addEventListener("click", () => this.newLayout());
    this.getElement("#extend-module-maker")
      .addEventListener("click", () => this.openModuleMaker());
    this.getElement("#credits-fields")
      .addEventListener("click", (e) => this.chooseCredits(e));
    this.getElement("#config-field")
      .addEventListener("input", () => this.validateConfig());
    this.getElement("#discard-module")
      .addEventListener("click", () => this.closeModuleMaker());
    this.getElement("#reset-maker")
      .addEventListener("click", () => this.resetMaker());
    this.getElement("#create-module")
      .addEventListener("click", () => this.createModule());
    this.getElement("#set-drive-images")
      .addEventListener("click", () => this.setDriveFolderConfig());
    this.getElement("#set-single-big-image")
      .addEventListener("click", () => this.setLocalImageConfig());
  }
  getElement(selector: string): Element {
    return this.container.querySelector(selector)!;
  }
  getHTMLElement<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.container.querySelector(selector)!;
  }
  clearPlaylist() {
    this.playlist = [];
    this.render();
  }
  loadLivePlaylist() {
    // Make a deep-copy of the live playlist, so we don't modify the
    // copy we were passed-in.
    this.playlist = JSON.parse(JSON.stringify(this.livePlaylist));
    this.render();
  }
  loadAll() {
    this.playlist = [{
      moduleDuration: 30,
      duration: 600,
      modules: [...library.keys()],
    }];
    this.render();
  }
  newLayout() {
    let duration = 1800;
    let moduleDuration = 300;
    if (this.playlist.length) {
      const lastLayout = this.playlist[this.playlist.length - 1];
      duration = lastLayout.duration;
      moduleDuration = lastLayout.moduleDuration;
    }
    this.playlist.push({ modules: ["_empty"], duration, moduleDuration });
    this.render();
  }
  openModuleMaker() {
    this.getHTMLElement("#module-maker").style.right = "0";
  }
  closeModuleMaker() {
    this.getHTMLElement("#module-maker").style.right = "";
  }
  resetMaker() {
    this.getHTMLElement<HTMLFormElement>("#module-maker-form").reset();
    this.getHTMLElement("#normal-config").style.display = "block";
    this.getHTMLElement("#drive-folder-config").style.display = "none";
    this.getHTMLElement("#local-image-config").style.display = "none";
  }
  setDriveFolderConfig() {
    this.getHTMLElement<HTMLInputElement>("#name-field").value = getDate();
    this.getHTMLElement<HTMLOptionElement>(
      '#extend-field option[value="slideshow"]',
    )
      .selected = true;
    this.getHTMLElement("#normal-config").style.display = "none";
    this.getHTMLElement("#drive-folder-config").style.display = "block";
    this.getHTMLElement("#local-image-config").style.display = "none";
  }
  setLocalImageConfig() {
    this.getHTMLElement<HTMLInputElement>("#name-field").value = getDate();
    this.getHTMLElement<HTMLOptionElement>(
      '#extend-field option[value="slideshow"]',
    )
      .selected = true;
    this.getHTMLElement("#normal-config").style.display = "none";
    this.getHTMLElement("#drive-folder-config").style.display = "none";
    this.getHTMLElement("#local-image-config").style.display = "block";
  }
  createModule() {
    const extendEl = this.getHTMLElement<HTMLInputElement>("#extend-field");
    const nameEl = this.getHTMLElement<HTMLInputElement>("#name-field");
    const titleEl = this.getHTMLElement<HTMLInputElement>("#title-field");
    const authorEl = this.getHTMLElement<HTMLInputElement>("#author-field");
    const imageEl = this.getHTMLElement<HTMLInputElement>("#image-field");
    const configEl = this.getHTMLElement<HTMLInputElement>("#config-field");

    let invalid = false;
    if (nameEl.value) {
      nameEl.classList.remove("invalid");
    } else {
      nameEl.classList.add("invalid");
      invalid = true;
    }

    let credits: CreditJson | undefined = undefined;
    if (!(titleEl.parentElement! as HTMLInputElement).disabled) {
      if (titleEl.value) {
        titleEl.classList.remove("invalid");
        const credit: CreditAuthorTitleJson = {
          title: titleEl.value,
        };

        if (authorEl.value) {
          credit.author = authorEl.value;
        }
        credits = credit;
      } else {
        titleEl.classList.add("invalid");
        invalid = true;
      }
    } else if (!(imageEl.parentElement as HTMLInputElement).disabled) {
      if (imageEl.value) {
        imageEl.classList.remove("invalid");
        const credit: CreditImageJson = {
          image: imageEl.value,
        };
        credits = credit;
      } else {
        imageEl.classList.add("invalid");
        invalid = true;
      }
    }

    let config;
    if (
      this.getHTMLElement("#normal-config").style.display != "none"
    ) {
      if (configEl.value) {
        try {
          config = JSON.parse(configEl.value);
        } catch {
          invalid = true;
        }
      }
    } else if (
      this.getHTMLElement("#drive-folder-config").style.display !=
        "none"
    ) {
      const splitEl = this.getHTMLElement<HTMLInputElement>("#drive-split");
      // TODO(applmak): Add fancy validation that actually queries that the
      // folder is accessible.
      const folderEl = this.getHTMLElement<HTMLInputElement>(
        "#drive-folder-field",
      );
      const fileEl = this.getHTMLElement<HTMLInputElement>("#drive-file-field");

      if (
        (folderEl.value || fileEl.value) && !(folderEl.value && fileEl.value)
      ) {
        fileEl.classList.remove("invalid");
        folderEl.classList.remove("invalid");

        const drive = {
          split: splitEl.checked,
          fileId: "",
          folderId: "",
        };
        if (fileEl.value) {
          drive.fileId = fileEl.value;
        } else {
          drive.folderId = folderEl.value;
        }

        config = {
          load: { drive },
          display: {
            fullscreen: {
              period: 8000,
              image: {
                scale: "full",
              },
            },
          },
        };
      } else {
        fileEl.classList.add("invalid");
        folderEl.classList.add("invalid");
        invalid = true;
      }
    } else if (
      this.getHTMLElement("#local-image-config").style.display !=
        "none"
    ) {
      const imageEl = this.getHTMLElement<HTMLInputElement>(
        "#local-image-field",
      );
      if (imageEl.value) {
        imageEl.classList.remove("invalid");
        config = {
          load: {
            local: {
              image: {
                file: imageEl.value,
                presplit: true,
              },
            },
          },
          display: {
            fullscreen: {
              period: 0,
              image: {
                scale: "full",
              },
            },
          },
        };
      } else {
        imageEl.classList.add("invalid");
        invalid = true;
      }
    }

    if (invalid) {
      return;
    }

    const newModuleDef: ExtendsBrickJson = {
      name: nameEl.value,
      extends: extendEl.value,
      credit: credits || { title: "Untitled" },
      config,
    };

    library.set(newModuleDef.name, newModuleDef);
    this.renderModuleConfig();
    this.closeModuleMaker();
  }
  setLivePlaylist(livePlaylist: LayoutConfig[]) {
    this.livePlaylist = livePlaylist;
  }
  open() {
    this.container.style.right = "0";
  }
  close() {
    this.container.style.right = `-${this.container.offsetWidth}px`;
  }
  applyPlaylist() {
    this.close();
    this.applyPlaylistFn(this.playlist);
  }
  resetPlaylist() {
    this.close();
    this.applyPlaylistFn("reset");
  }
  chooseCredits(e: Event) {
    const fieldsetEl = (e.target! as Element).closest("fieldset");
    if (fieldsetEl) {
      if (fieldsetEl.disabled) {
        Array.from(fieldsetEl.parentElement!.children).forEach((e) =>
          (e as HTMLInputElement).disabled = true
        );
        fieldsetEl.disabled = false;
      }
    }
  }
  validateConfig() {
    const textareaEl = this.getHTMLElement<HTMLTextAreaElement>(
      "#config-field",
    );
    try {
      JSON.parse(textareaEl.value);
      textareaEl.classList.remove("invalid");
    } catch (e) {
      textareaEl.classList.add("invalid");
    }
  }

  render() {
    const playlistEl = this.getHTMLElement("#current-playlist");
    Array.from(playlistEl.children).forEach((e) => e.remove());

    Sortable.create(playlistEl, {
      group: "layouts",
      animation: 150,
      removeOnSpill: true,
      onEnd: (evt: any) => {
        if (!evt.item.parentElement) {
          // Remove the item.
          this.playlist.splice(evt.oldIndex, 1);
        } else {
          // Need to move.
          const layout = this.playlist[evt.oldIndex];
          this.playlist.splice(evt.oldIndex, 1);
          this.playlist.splice(evt.newIndex, 0, layout);
        }
      },
    });

    for (const layout of this.playlist) {
      const layoutEl = document.createElement("div");
      layoutEl.className = "layout";

      const header = document.createElement("div");
      header.className = "header";
      header.textContent = "Layout ";

      const durationEl = document.createElement("span");
      makeEditableText(
        durationEl,
        () => String(layout.duration),
        (d) => {
          layout.duration = Number(d);
        },
      );
      header.appendChild(durationEl);

      header.appendChild(document.createTextNode("s ("));

      const moduleDurationEl = document.createElement("span");
      makeEditableText(
        moduleDurationEl,
        () => String(layout.moduleDuration),
        (d) => {
          layout.moduleDuration = Number(d);
        },
      );
      header.appendChild(moduleDurationEl);

      header.appendChild(document.createTextNode("s / module)"));

      layoutEl.appendChild(header);

      const modules = layout.modules || [];
      for (const moduleName of modules || []) {
        const mEl = document.createElement("div");
        mEl.classList.add("module");

        const nEl = document.createElement("span");
        nEl.textContent = moduleName;
        mEl.appendChild(nEl);

        layoutEl.appendChild(mEl);
      }
      Sortable.create(layoutEl, {
        group: "modules",
        animation: 150,
        filter: ".header,.footer",
        removeOnSpill: true,
        onMove: (evt: any) => {
          if (
            (evt.related.className == "header" && !evt.willInsertAfter) ||
            (evt.related.className == "footer" && evt.willInsertAfter)
          ) {
            return false;
          }
        },
        onEnd: (evt: any) => {
          if (!evt.item.parentElement) {
            // Remove the item.
            evt.oldIndex--;
            modules.splice(evt.oldIndex, 1);
          } else if (evt.to == layoutEl) {
            evt.newIndex--;
            if (evt.from == layoutEl) {
              // Need to move.
              evt.oldIndex--;
              const name = modules[evt.oldIndex];
              modules.splice(evt.oldIndex, 1);
              modules.splice(evt.newIndex, 0, name);
            } else {
              // Need to add.
              console.log(evt.clone.textContent);
            }
          }
        },
        onAdd: (evt: any) => {
          if (evt.to == layoutEl) {
            evt.newIndex--;
            // Need to add.
            modules.splice(
              evt.newIndex,
              0,
              evt.clone.firstChild.textContent,
            );
          }
        },
      });

      const footer = document.createElement("div");
      footer.className = "footer";
      footer.innerHTML = "&nbsp;";
      layoutEl.appendChild(footer);

      playlistEl.appendChild(layoutEl);
    }
  }

  renderModuleConfig() {
    const modulesEl = this.getHTMLElement("#all-known-modules");
    Array.from(modulesEl.children).forEach((m) => m.remove());

    for (const name of library.keys()) {
      const module = library.get(name)!;
      const mEl = document.createElement("div");
      mEl.className = "module";

      const nEl = document.createElement("span");
      nEl.textContent = name;
      mEl.appendChild(nEl);

      if (isExtendsBrickJson(module)) {
        mEl.appendChild(document.createTextNode(" extends "));
        const eEl = document.createElement("span");
        eEl.textContent = module.extends || null;
        mEl.appendChild(eEl);
      }
      modulesEl.appendChild(mEl);
    }

    Sortable.create(modulesEl, {
      group: {
        name: "modules",
        pull: "clone",
        put: false,
      },
      draggable: ".module",
      animation: 150,
      sort: false,
      onMove: (evt: any) => {
        if (
          (evt.related.className == "header" && !evt.willInsertAfter) ||
          (evt.related.className == "footer" && evt.willInsertAfter)
        ) {
          return false;
        }
      },
      onEnd: (evt: any) => {
        Array.from(evt.item.childNodes as Node[]).slice(1).forEach((e) =>
          e.parentNode!.removeChild(e)
        );
      },
    });

    // Also update extend-field:
    const extendEl = this.getHTMLElement("#extend-field");
    // Get a set of options.
    const optionsToRemove = new Set(
      Array.from(extendEl.children).map((c) => (c as HTMLInputElement).value),
    );
    for (const name of library.keys()) {
      if (optionsToRemove.has(name)) {
        optionsToRemove.delete(name);
      } else {
        const option = document.createElement("option");
        option.textContent = name;
        option.value = name;
        extendEl.appendChild(option);
      }
    }

    optionsToRemove.forEach((c) => {
      for (const child of Array.from(extendEl.children) as HTMLInputElement[]) {
        if (child.value === c) {
          child.remove();
        }
      }
    });
  }
}
