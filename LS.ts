import { HttpClient } from "@angular/common/http";
import { Signal, computed, inject, signal } from "@angular/core";
import { EMPTY, catchError, tap } from "rxjs";
import { LnModel } from "../models/language";

type LnName = {
    fileName: string,
    url?: undefined
}

type LnUrl = {
    url: string,
    fileName?: undefined
}

type LnConfig = { displayName: string } & (LnName | LnUrl)

type Direction = "rtl" | "ltr"
type FontWeight = "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "bold" | "normal" | "lighter"
type FontStyle = "normal" | "italic"

type LnFont = {
    family: string,
    weight: FontWeight,
    style: FontStyle,
}

type LsLnInfo<Tfonts extends string = string> = {
    lsInfo: {
        direction: Direction
        fonts: Record<Tfonts, LnFont>
    }
}

type LnAlias = {
    displayName: string
    aliases: string[]
}

type Action<T> = (val: T) => void

class Data {
    baseUrl?: string
    languages: string[] = []
    lnsMap = new Map<string, LnConfig>()
    localStorageKey?: string
    aliasesMap?: Map<string, string>
    createCssVariables?: boolean

    constructor(public client: HttpClient) { }
}

class LS<TLnModel> {
    private readonly client: HttpClient
    private readonly baseUrl?: string
    private readonly lnsMap = new Map<string, LnConfig>()
    private readonly localStorageKey?: string
    private readonly aliasesMap?: Map<string, string>
    private readonly onLnChangeHandlersMap = new  Map<Action<TLnModel>, Action<TLnModel>>()
    private readonly $language = signal<TLnModel | undefined>(undefined)
    private readonly _$curLn = signal<string | undefined>(undefined)

    readonly $languages: Signal<string[]>
    readonly $isLnLoaded = computed(() => this.$language() != undefined)
    readonly $curLnIndex = computed(() => {
        if (this._$curLn() == undefined) return undefined
        else return this.$languages().findIndex(ln => ln == this._$curLn())
    })

    get $curLn() {
        return this._$curLn.asReadonly()
    }

    constructor(data: Data) {
        this.client = data.client
        this.baseUrl = data.baseUrl
        this.$languages = signal(data.languages).asReadonly()
        this.lnsMap = data.lnsMap
        this.localStorageKey = data.localStorageKey
        this.aliasesMap = data.aliasesMap

        if (data.createCssVariables != true) return
        this.addOnLnChangeHandler(ln => {
            const info = (ln as LsLnInfo).lsInfo

            document.documentElement.style.setProperty("--ls_dir", info.direction)
            for (const key in info.fonts) {
                document.documentElement.style.setProperty(`--ls_${key}_font-family`, info.fonts[key].family)
                document.documentElement.style.setProperty(`--ls_${key}_font-style`, info.fonts[key].style)
                document.documentElement.style.setProperty(`--ls_${key}_font-weight`, info.fonts[key].weight)
            }
        })
    }

    addOnLnChangeHandler(handler: Action<TLnModel>, runNow?: boolean) {
        if(runNow && this.$isLnLoaded()) handler(this.$language()!)
        this.onLnChangeHandlersMap.set(handler, handler)
        return this
    }

    removeOnLnChangeHandler(handler: Action<TLnModel>) {
        this.onLnChangeHandlersMap.delete(handler)
        return this
    }

    setLn(key: string) {
        const lnConfig = this.lnsMap.get(key)
        if (lnConfig == undefined) throw `language map does not contain key ${key}\nmaybe you forgot to register this language?`

        if (this.localStorageKey != undefined) localStorage.setItem(this.localStorageKey, key)

        const url = lnConfig.url != undefined ? lnConfig.url : `${this.baseUrl}/${lnConfig.fileName}`
        this.client.get<TLnModel>(url)
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
                this._$curLn.set(key)
                this.$language.set(ln)
            })

        return this
    }

    setPreferredLn(fallBackLnKey: string) {
        if (this.localStorageKey != undefined) {
            const key = localStorage.getItem(this.localStorageKey)
            if (key != undefined) {
                this.setLn(key)
                return this
            }
        }

        if (this.aliasesMap != undefined) {
            for (const ln of navigator.languages) {
                const key = this.aliasesMap.get(ln.toLowerCase())
                if (key != undefined) {
                    this.setLn(key)
                    return this
                }
            }

        }

        this.setLn(fallBackLnKey)
        return this
    }

    getData<Tres>(cb: (ln: TLnModel) => Tres, unsafe: true): Signal<Tres>;
    getData<Tres>(cb: (ln: TLnModel) => Tres, unsafe?: false): Signal<Tres | undefined>;
    getData<Tres>(cb: (ln: TLnModel) => Tres, unsafe?: boolean): Signal<Tres | undefined> | Signal<Tres> {
        return computed(() => {
            if (!unsafe && this.$language() == undefined) return undefined
            return cb(this.$language()!)
        })
    }
}

export class LSBuilder<TLnModel> {
    private readonly data = new Data(inject(HttpClient))

    setBaseUrl(baseUrl: string) {
        this.data.baseUrl = baseUrl
        return this
    }

    registerLns(...lns: LnConfig[]) {
        for (const ln of lns) {
            this.data.languages.push(ln.displayName)

            if (ln.fileName != undefined) {
                if (this.data.baseUrl == undefined) throw "to be able to provide file name insted of url you must provide base url (use setBaseUrl before ln's registration)"
            }
            this.data.lnsMap.set(ln.displayName, ln)
        }

        return this
    }

    useCssVariables<TFonts extends string>() {
        this.data.createCssVariables = true
        return this as LSBuilder<TLnModel & LsLnInfo<TFonts>>
    }

    useLocalStorage(key: string) {
        this.data.localStorageKey = key
        return this
    }

    useBrowserLn(...lnAliases: LnAlias[]) {
        this.data.aliasesMap = new Map<string, string>()

        for (const ln of lnAliases) {
            for (const alias of ln.aliases) {
                this.data.aliasesMap.set(alias.toLowerCase(), ln.displayName)
            }
        }

        return this
    }

    build() {
        return new LS<TLnModel>(this.data)
    }
}