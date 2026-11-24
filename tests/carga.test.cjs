const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const core = require('@angular/core');
require('@angular/compiler');
const { HttpErrorResponse } = require('@angular/common/http');

function preparar()
{
    const renders = [];
    const scrolls = [];
    const foco = [];
    const consulta = { consulta: core.signal({ filas: [] }) };
    class DdcpConsultaService {}
    let responder = async () => previa;
    const api = { post: (...args) => responder(...args) };
    const sesion = {
        ocupado: core.signal(false), error: core.signal(''), mensaje: core.signal(''),
        pagina: 'carga', alSalir(fn) { this.limpiar = fn; }
    };
    class PantallaBase
    {
        constructor()
        {
            this.session = sesion; this.api = api; this.injector = {};
            this.ocupado = sesion.ocupado; this.mensaje = sesion.mensaje;
            this.reglas = { maxArchivoBytes: 10485760 }; this.meses = ['Enero', 'Febrero'];
        }
        get pagina() { return sesion.pagina; }
        token() { return 'token-prueba'; }
        establecerError(error) { sesion.error.set(error); }
        async ejecutar(accion)
        {
            if (sesion.ocupado()) return;
            sesion.ocupado.set(true); sesion.error.set(''); sesion.mensaje.set('');
            try { await accion(); }
            catch (error) { sesion.error.set(error.message); }
            finally { sesion.ocupado.set(false); }
        }
    }
    const previa = {
        idCarga: 'carga-prueba', anio: 2026, mes: 2,
        filas: [{ idEntidad: 1, nombreEntidad: 'Aguascalientes', dispositivos: '999999999999999999', personas: 2, dispositivosAntes: null, personasAntes: null, revisionAntes: null, habilitadoAntes: null }],
        advertencias: ['Revise el periodo seleccionado.']
    };
    const contexto = {
        exports: {}, Blob, FormData,
        window: { scrollY: 0, matchMedia: () => ({ matches: true }), scrollTo: x => scrolls.push(x) },
        document: { querySelector: selector => selector === '.topbar' ? { getBoundingClientRect: () => ({ height: 87 }) } : { getBoundingClientRect: () => ({ top: 500 }), focus: x => foco.push(x) } },
        require: nombre => {
            if (nombre === '@angular/core') return { ...core, afterNextRender: fn => renders.push(fn) };
            if (nombre === '@angular/common/http') return { HttpErrorResponse };
            if (nombre === './pantalla-base') return { PantallaBase };
            if (nombre === './ddcp-consulta.service') return { DdcpConsultaService };
            if (nombre.includes('descargar-archivo')) return { descargarArchivo() {} };
            throw Error('Dependencia inesperada: ' + nombre);
        }
    };
    const fuente = fs.readFileSync('src/app/core/services/ddcp-carga.service.ts', 'utf8');
    vm.runInNewContext(ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true } }).outputText, contexto);
    const injector = core.Injector.create({ providers: [{ provide: DdcpConsultaService, useValue: consulta }] });
    const servicio = core.runInInjectionContext(injector, () => new contexto.exports.DdcpCargaService());
    servicio.archivo = { name: 'reporte.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', arrayBuffer: async () => new ArrayBuffer(3) };
    return { servicio, sesion, previa, consulta, renders, scrolls, foco, responder: fn => { responder = fn; } };
}

test('validar muestra el aviso de revisión sin guardar la carga', async () => {
    const x = preparar();
    await x.servicio.validar();
    assert.equal(x.servicio.aviso?.()?.tipo, 'validada');
    assert.equal(x.servicio.previa()?.idCarga, 'carga-prueba');
    assert.equal(x.servicio.aviso?.()?.dispositivos, '999999999999999999');
    assert.equal(x.scrolls.length, 0);
    x.servicio.cerrarAviso?.();
    x.renders.forEach(fn => fn());
    assert.equal(x.servicio.aviso?.() ?? null, null);
    assert.equal(x.scrolls.length, 1);
    assert.equal(x.foco.length, 1);
});

test('una validación fallida no anuncia éxito', async () => {
    const x = preparar();
    x.responder(async () => { throw Error('Excel inválido'); });
    await x.servicio.validar();
    assert.equal(x.servicio.previa(), null);
    assert.equal(x.servicio.aviso?.() ?? null, null);
    assert.equal(x.sesion.error(), 'Excel inválido');
});

test('el éxito aparece después de guardar y conserva el resumen al limpiar el formulario', async () => {
    const x = preparar();
    await x.servicio.validar();
    x.servicio.cerrarAviso?.();
    let completar;
    x.responder(() => new Promise(resolve => { completar = resolve; }));
    const guardando = x.servicio.confirmar();
    assert.equal(x.servicio.aviso?.() ?? null, null);
    completar({ mensaje: 'Guardado' });
    await guardando;
    assert.equal(x.servicio.aviso?.()?.tipo, 'confirmada');
    assert.equal(x.servicio.aviso?.()?.anio, 2026);
    assert.equal(x.servicio.aviso?.()?.mes, 2);
    assert.equal(x.servicio.aviso?.()?.personas, 2);
    assert.equal(x.servicio.archivo, null);
    assert.equal(x.servicio.previa(), null);
    assert.equal(x.consulta.consulta(), null);
    x.sesion.limpiar();
    assert.equal(x.servicio.aviso?.() ?? null, null);
});

test('si confirmar falla conserva la vista previa para reintentar y no muestra carga correcta', async () => {
    const x = preparar();
    await x.servicio.validar();
    x.servicio.cerrarAviso?.();
    x.responder(async () => { throw Error('No se guardó'); });
    await x.servicio.confirmar();
    assert.equal(x.servicio.aviso?.() ?? null, null);
    assert.equal(x.servicio.previa()?.idCarga, 'carga-prueba');
    assert.notEqual(x.servicio.archivo, null);
    assert.equal(x.sesion.error(), 'No se guardó');
});

test('cerrar un aviso no confirma ni elimina una carga pendiente', async () => {
    const x = preparar();
    await x.servicio.validar();
    x.servicio.cerrarAviso();
    assert.equal(x.servicio.previa()?.idCarga, 'carga-prueba');
    assert.notEqual(x.servicio.archivo, null);
    assert.equal(x.servicio.aviso(), null);
    x.sesion.pagina = 'inicio';
    x.renders.forEach(fn => fn());
    assert.equal(x.scrolls.length, 0);
});
