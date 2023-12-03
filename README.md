# LS

Simple language service for angular projects,
that make it easy to work with multiple languages

## v1

This is the *first version of this service
for now it's just simple DIY solution of i18n for my angular projects.

\* technically it's version 2  
version 1 was in code implementation of this idea  
now it's build more like a library that the user just need to consume


### Features

* Supports loading language files (json files) from inside and outside the project in runtime

* Supports multiple fonts and fonts styling per language

* Built-in option to use local storage and browser language

* Built-in option to create css variables that contain the ln info like direction and fonts style so they ready to use inside your css

* Option to register events onLnChange to extend the default behavior as you need

the api exposes all the basic info you probably need with signals so it will react to changes and work with **OnPush** change detection strategy

all of this while type safe, with option to extend the base ln file interface with your own additions