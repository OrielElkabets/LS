import { HttpClient } from "@angular/common/http";
import { Injectable, Signal, computed, signal } from "@angular/core";
import { EMPTY, catchError, tap } from "rxjs";

type LnName = {
    fileName: string,
    url?: undefined,
}

type Lnlink = {
    url: string,
    fileName?: undefined,
}

type LnConfig = { displayName: string, aliases?: string[] } & (LnName | Lnlink)

type Direction = "rtl" | "ltr"
type FontWeight = "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "bold" | "normal" | "lighter"
type FontStyle = "normal" | "italic"

type LnFont = {
    family: string,
    weight: FontWeight,
    style: FontStyle,
}

export interface ILnStracture<Tdict = unknown, Tfonts extends string = string> {
    info: {
        direction: Direction
        fonts: Record<Tfonts, LnFont>
    },
    dict: Tdict
}

@Injectable({
    providedIn: 'root'
})
export class LS<T extends ILnStracture> {
    private readonly client: HttpClient
    private readonly lnMap = new Map<string, LnName | Lnlink>()
    private readonly lnAliasMap = new Map<string, string>()

    private localStorageKey?: string
    private baseUrl?: string
    private readonly onLnChangeHandlersMap = new Map<(v: T) => void, (v: T) => void>()
    private _curLnIndex = -1

    private readonly $language = signal<T | undefined>(undefined)

    constructor(client: HttpClient) {
        this.client = client
    }

    readonly $lnLoaded = computed(() => this.$language() != undefined)
    readonly lnOptions: string[] = []

    public get curLnIndex(): number {
        return this._curLnIndex
    }


    createCssPropsOnChange() {
        this.addOnLnChangeHandler(ln => {
            document.documentElement.style.setProperty("--ls_dir", ln.info.direction)
            for (const key in ln.info.fonts) {
                document.documentElement.style.setProperty(`--ls_${key}_font-family`, ln.info.fonts[key].family)
                document.documentElement.style.setProperty(`--ls_${key}_font-style`, ln.info.fonts[key].style)
                document.documentElement.style.setProperty(`--ls_${key}_font-weight`, ln.info.fonts[key].weight)
            }
        })

        return this
    }

    setBaseUrl(baseUrl: string) {
        this.baseUrl = baseUrl
        return this
    }

    addOnLnChangeHandler(handler: (ln: T) => void) {
        this.onLnChangeHandlersMap.set(handler, handler)
        return this
    }

    removeOnLnChangeHandler(handler: (ln: T) => void) {
        this.onLnChangeHandlersMap.delete(handler)
        return this
    }

    registerLns(...lns: LnConfig[]) {
        for (const ln of lns) {
            this.lnOptions.push(ln.displayName)

            if (ln.fileName != undefined) {
                if (this.baseUrl == undefined) throw "to be able to provide file name insted of url you must provide base url (use setBaseUrl before ln's registration)"
            }
            this.lnMap.set(ln.displayName, ln)


            if (ln.aliases == undefined) continue
            for (const alias of ln.aliases) {
                this.lnAliasMap.set(alias.toLowerCase(), ln.displayName)
            }
        }

        return this
    }

    getSection<Tres>(cb: (ln: T) => Tres, unsafe: true): Signal<Tres>;
    getSection<Tres>(cb: (ln: T) => Tres, unsafe?: false): Signal<Tres | undefined>;
    getSection<Tres>(cb: (ln: T) => Tres, unsafe?: boolean): Signal<Tres | undefined> | Signal<Tres> {
        return computed(() => {
            if (!unsafe && this.$language() == undefined) return undefined
            return cb(this.$language()!)
        })
    }

    setLn(key: string) {
        if (this.lnAliasMap.has(key)) {
            key = this.lnAliasMap.get(key)!
        }

        const lnConfig = this.lnMap.get(key)
        if (lnConfig == undefined) throw `language map does not contain key ${key}\nmaybe you forgot to register this language?`

        if (this.localStorageKey != undefined) localStorage.setItem(this.localStorageKey, key)

        const url = lnConfig.url != undefined ? lnConfig.url : `${this.baseUrl}/${lnConfig.fileName}`
        this.client.get<T>(url)
            .pipe(
                catchError(err => {
                    console.error(err);
                    return EMPTY
                }),
                tap(ln => {
                    for (const handler of this.onLnChangeHandlersMap.values()) {
                        handler(ln)
                    }
                })
            )
            .subscribe(ln => {
                this._curLnIndex = this.lnOptions.findIndex(val => val == key)
                this.$language.set(ln)
            })

        return this
    }

    useLocalStorage(key: string) {
        this.localStorageKey = key
        return this
    }

    setPreferredLn(fallBackLnKey: string, options?: { tryBrowserPreferredLn?: boolean, tryLocalStorage?: boolean }) {
        if (options?.tryLocalStorage != false && this.localStorageKey != undefined) {
            const key = localStorage.getItem(this.localStorageKey)
            if (key != undefined) {
                this.setLn(key)
                return this
            }
        }

        if (options?.tryBrowserPreferredLn != false) {
            for (const ln of navigator.languages) {
                const key = this.lnAliasMap.get(ln.toLowerCase())
                if (key != undefined) {
                    this.setLn(key)
                    return this
                }
            }

        }

        this.setLn(fallBackLnKey)
        return this
    }
}