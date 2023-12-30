import { HttpClient } from "@angular/common/http";
import { DestroyRef, Signal, computed, inject, signal } from "@angular/core";
import { EMPTY, catchError } from "rxjs";

type LnName = {
    fileName: string,
    url?: undefined
}

type LnUrl = {
    url: string,
    fileName?: undefined
}

type LnConfig = { displayName: string } & (LnName | LnUrl)

type KeyAndName<T extends string> = { key: T, displayName: string }

type Direction = "rtl" | "ltr"
type FontWeight = "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "bold" | "normal" | "lighter"
type FontStyle = "normal" | "italic"

type LnFont = {
    family: string,
    weight: FontWeight,
    style: FontStyle,
}

export type LsLnInfo<Tfonts extends string = string> = {
    lsInfo: {
        direction: Direction
        fonts: Record<Tfonts, LnFont>
    }
}

type Action<T> = (val: T) => void

class Data {
    baseUrl?: string
    languages: KeyAndName<string>[] = []
    lnsMap = new Map<string, LnConfig>()
    localStorageKey?: string
    aliasesMap?: Map<string, string>
    createCssVariables?: boolean

    constructor(public client: HttpClient) { }
}

export type IDisposable = {
    dispose(): void
}

class Cleanup implements IDisposable {
    private cleanupCbs: (() => void)[] = []
    add(cb: () => void) {
        this.cleanupCbs.push(cb)
    }
    dispose() {
        for (const cb of this.cleanupCbs) {
            cb()
        }
    }
}

type Builder1<TLnModel> = {
    setBaseUrl(baseUrl: string): Builder2<TLnModel>
    registerLns<T extends string = string>(lns: Record<T, { displayName: string, url: string }>): Builder3<TLnModel, T>
}

type Builder2<TLnModel> = {
    registerLns<T extends string = string>(lns: Record<T, LnConfig>): Builder3<TLnModel, T>
}

interface Builder3<TLnModel, TLns extends string> {
    createCssVariables<TFonts extends string>(): Builder3<TLnModel & LsLnInfo<TFonts>, TLns>

    useLocalStorage(key?: string): Builder3<TLnModel, TLns>

    useBrowserLn(lnAliases: Partial<Record<TLns, string[]>>): Builder3<TLnModel, TLns>

    build(): LS<TLnModel, TLns>
}

export class LS<TLnModel, TLns extends string = string> {
    private readonly client: HttpClient
    private readonly baseUrl?: string
    private readonly lnsMap = new Map<TLns, LnConfig>()
    private readonly localStorageKey?: string
    private readonly aliasesMap?: Map<string, TLns>
    private readonly onLnChangeHandlersMap = new Map<Action<TLnModel>, Action<TLnModel>>()
    private readonly $language = signal<TLnModel | undefined>(undefined)
    private readonly _$curLnKey = signal<TLns | undefined>(undefined)

    readonly $languages: Signal<KeyAndName<TLns>[]>
    readonly $isLnLoaded = computed(() => this.$language() != undefined)

    readonly $curLn = computed(() => {
        if (this._$curLnKey() == undefined) return undefined
        else return this.$languages().find(ln => ln.key == this._$curLnKey())
    })

    private constructor(data: Data) {
        this.client = data.client
        this.baseUrl = data.baseUrl
        this.$languages = signal(data.languages as unknown as KeyAndName<TLns>[]).asReadonly()
        this.lnsMap = data.lnsMap as Map<TLns, LnConfig>
        this.localStorageKey = data.localStorageKey
        this.aliasesMap = data.aliasesMap as Map<string, TLns>

        if (data.createCssVariables != true) return
        this.onLnChange(ln => {
            const info = (ln as LsLnInfo).lsInfo

            document.documentElement.style.setProperty("--ls_dir", info.direction)
            for (const key in info.fonts) {
                document.documentElement.style.setProperty(`--ls_${key}_font-family`, info.fonts[key].family)
                document.documentElement.style.setProperty(`--ls_${key}_font-style`, info.fonts[key].style)
                document.documentElement.style.setProperty(`--ls_${key}_font-weight`, info.fonts[key].weight)
            }
        })
    }

    static builder<TLnModel>() {
        return new LSBuilder<TLnModel>(<T, T2 extends string>(data: Data) => new LS<T, T2>(data)) as Builder1<TLnModel>
    }

    onLnChange(handler: Action<TLnModel>, options?: { runNow?: boolean } & ({ destroyRef?: DestroyRef, manualCleanup?: false } | { destroyRef?: undefined, manualCleanup?: true })) {
        const cleanup = new Cleanup()
        cleanup.add(() => this.onLnChangeHandlersMap.delete(handler))
        if (options?.manualCleanup != true) {
            const df = options?.destroyRef ?? inject(DestroyRef)
            const onDestroyCleanup = df.onDestroy(() => this.onLnChangeHandlersMap.delete(handler))
            cleanup.add(onDestroyCleanup)
        }
        if (options?.runNow && this.$isLnLoaded()) handler(this.$language()!)
        this.onLnChangeHandlersMap.set(handler, handler)
        return cleanup as IDisposable
    }

    setLn(key: string) {
        const lnConfig = this.lnsMap.get(key as TLns)
        if (lnConfig == undefined) throw `language map does not contain key ${key}\nmaybe you forgot to register this language?`

        if (this.localStorageKey != undefined) localStorage.setItem(this.localStorageKey, key)

        const url = lnConfig.url != undefined ? lnConfig.url : `${this.baseUrl}/${lnConfig.fileName}`
        this.client.get<TLnModel>(url)
            .pipe(catchError(err => {
                console.error(err);
                return EMPTY
            }))
            .subscribe(ln => {
                this._$curLnKey.set(key as TLns)
                this.$language.set(ln)
                for (const handler of this.onLnChangeHandlersMap.values()) {
                    handler(ln)
                }
            })

        return this
    }

    setPreferredLn(fallBackLnKey: TLns) {
        if (this.localStorageKey != undefined) {
            const key = localStorage.getItem(this.localStorageKey)
            if (key != null && this.$languages().some(ln => ln.key == key)) {
                this.setLn(key as TLns)
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

    getSection<Tres>(cb: (ln: TLnModel) => Tres, unsafe: true): Signal<Tres>;
    getSection<Tres>(cb: (ln: TLnModel) => Tres, unsafe?: false): Signal<Tres | undefined>;
    getSection<Tres>(cb: (ln: TLnModel) => Tres, unsafe?: boolean): Signal<Tres | undefined> | Signal<Tres> {
        return computed(() => {
            if (!unsafe && this.$language() == undefined) return undefined
            return cb(this.$language()!)
        })
    }
}

class LSBuilder<TLnModel, TLns extends string = string> implements Builder1<TLnModel>, Builder2<TLnModel>, Builder3<TLnModel, TLns> {
    private readonly data = new Data(inject(HttpClient))
    constructor(private createLS: <TLnModel, TLns extends string>(data: Data) => LS<TLnModel, TLns>) { }

    setBaseUrl(baseUrl: string) {
        this.data.baseUrl = baseUrl
        return this
    }

    registerLns<T extends string = string>(lns: Record<T, LnConfig>) {
        for (const key in lns) {
            const ln = lns[key]
            this.data.languages.push({ key: key, displayName: ln.displayName })

            //? because of types this is not supposed to happen, but for now I will leave this here.
            if (ln.fileName != undefined) {
                if (this.data.baseUrl == undefined) throw "to be able to provide file name insted of url you must provide base url (use setBaseUrl before ln's registration)"
            }

            this.data.lnsMap.set(key, ln)
        }

        return this as unknown as Builder3<TLnModel, T>
    }

    createCssVariables<TFonts extends string>() {
        this.data.createCssVariables = true
        return this as Builder3<TLnModel & LsLnInfo<TFonts>, TLns>
    }

    useLocalStorage(key = "ls-ln") {
        this.data.localStorageKey = key
        return this
    }

    // useBrowserLn(...lnAliases: LnAlias<TLns>[]) {
    useBrowserLn(lnAliases: Partial<Record<TLns, string[]>>) {
        this.data.aliasesMap = new Map<string, string>()

        for (const key in lnAliases) {
            const aliases = lnAliases[key] ?? []

            for (const alias of aliases) {
                this.data.aliasesMap.set(alias.toLowerCase(), key)
            }
        }

        return this
    }

    build() {
        return this.createLS<TLnModel, TLns>(this.data)
    }
}