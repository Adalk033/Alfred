"""
Monitor en tiempo real del uso de GPU
Ejecutar mientras Alfred está funcionando para ver el uso de recursos
DETECTA TODOS LOS PROCESOS GPU (Ollama, PyTorch, etc.)
"""

import time
import subprocess
import platform
import re
from gpu_manager import get_gpu_manager

def format_mb_to_gb(mb_value):
    """Convertir MB a GB"""
    try:
        return f"{float(mb_value) / 1024:.2f} GB"
    except:
        return "N/A"

def get_nvidia_smi_stats():
    """Obtener estadísticas usando nvidia-smi (detecta TODOS los procesos)"""
    try:
        # Obtener estadísticas de GPU
        cmd = [
            "nvidia-smi",
            "--query-gpu=temperature.gpu,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw",
            "--format=csv,noheader,nounits"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        
        if result.returncode == 0:
            values = result.stdout.strip().split(", ")
            if len(values) >= 5:
                return {
                    'temp': values[0],
                    'gpu_util': values[1],
                    'mem_util': values[2],
                    'mem_used': values[3],
                    'mem_total': values[4],
                    'power': values[5] if len(values) > 5 else 'N/A'
                }
    except Exception as e:
        pass
    return None

def get_gpu_processes():
    """Obtener procesos usando GPU"""
    try:
        cmd = [
            "nvidia-smi",
            "--query-compute-apps=pid,process_name,used_memory",
            "--format=csv,noheader"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        
        if result.returncode == 0 and result.stdout.strip():
            processes = []
            for line in result.stdout.strip().split('\n'):
                parts = line.split(', ')
                if len(parts) >= 3:
                    processes.append({
                        'pid': parts[0],
                        'name': parts[1],
                        'memory': parts[2]
                    })
            return processes
    except Exception as e:
        pass
    return []

def monitor_gpu(interval=2, duration=None):
    """
    Monitorear el uso de GPU en tiempo real usando nvidia-smi
    
    Args:
        interval: Segundos entre actualizaciones
        duration: Duración total en segundos (None = infinito)
    """
    gpu = get_gpu_manager()
    
    if not gpu.has_gpu:
        print("❌ No hay GPU disponible para monitorear")
        return
    
    print("=" * 80)
    print(f"🚀 MONITOR DE GPU EN TIEMPO REAL - {gpu.device_type}")
    print("=" * 80)
    print(f"Dispositivo: {gpu.gpu_info.get('device_name', 'N/A')}")
    mem_total = gpu.gpu_info.get('memory_total', 0)
    print(f"Memoria Total: {mem_total:.2f} GB")
    print("=" * 80)
    print("\n🔍 Monitoreando todos los procesos GPU (Ollama, PyTorch, etc.)")
    print("📊 Presiona Ctrl+C para detener\n")
    
    start_time = time.time()
    max_mem_used = 0
    
    try:
        iteration = 0
        while True:
            iteration += 1
            current_time = time.strftime("%H:%M:%S")
            
            # Obtener estadísticas usando nvidia-smi
            stats = get_nvidia_smi_stats()
            
            if stats:
                mem_used_mb = float(stats['mem_used'])
                mem_total_mb = float(stats['mem_total'])
                mem_used_gb = mem_used_mb / 1024
                mem_percent = (mem_used_mb / mem_total_mb * 100) if mem_total_mb > 0 else 0
                
                # Actualizar máximo
                if mem_used_gb > max_mem_used:
                    max_mem_used = mem_used_gb
                
                # Crear barra de progreso para memoria
                bar_length = 30
                filled = int(bar_length * mem_percent / 100)
                bar = "█" * filled + "░" * (bar_length - filled)
                
                # Mostrar estadísticas principales
                print(f"[{current_time}] "
                      f"🌡️ {stats['temp']}°C | "
                      f"💻 GPU: {stats['gpu_util']:>3}% | "
                      f"💾 Mem: {stats['mem_util']:>3}% | "
                      f"⚡ {stats['power']:>5}W")
                
                print(f"             "
                      f"� Memoria: [{bar}] {mem_used_gb:.2f}/{mem_total_mb/1024:.2f} GB ({mem_percent:.1f}%)")
                
                # Obtener procesos activos
                processes = get_gpu_processes()
                if processes:
                    print(f"             🔹 Procesos activos: {len(processes)}")
                    for proc in processes[:3]:  # Mostrar solo los primeros 3
                        proc_name = proc['name'].split('\\')[-1]  # Solo nombre del archivo
                        print(f"                • {proc_name} (PID: {proc['pid']}) - {proc['memory']}")
                else:
                    print(f"             ℹ️  No hay procesos activos en GPU")
                
                print()  # Línea en blanco para separar
                
            else:
                print(f"[{current_time}] ⚠️  No se pudo obtener estadísticas de GPU")
            
            # Verificar duración
            if duration and (time.time() - start_time) >= duration:
                break
            
            time.sleep(interval)
            
    except KeyboardInterrupt:
        print("\n")
        print("=" * 80)
        print("✓ Monitoreo detenido")
        print("=" * 80)
        
        # Mostrar resumen final
        elapsed = time.time() - start_time
        print(f"\n📊 Resumen de la sesión:")
        print(f"   • Duración: {elapsed:.1f} segundos ({iteration} muestras)")
        print(f"   • Máxima memoria usada: {max_mem_used:.2f} GB")
        
        # Estadísticas finales
        final_stats = get_nvidia_smi_stats()
        if final_stats:
            print(f"   • Memoria actual: {float(final_stats['mem_used'])/1024:.2f} GB")
            print(f"   • Temperatura final: {final_stats['temp']}°C")
        
        # Procesos finales
        final_processes = get_gpu_processes()
        if final_processes:
            print(f"\n🔹 Procesos activos al finalizar: {len(final_processes)}")
            for proc in final_processes:
                proc_name = proc['name'].split('\\')[-1]
                print(f"   • {proc_name} (PID: {proc['pid']}) - {proc['memory']}")


if __name__ == "__main__":
    import sys
    
    # Permitir especificar intervalo como argumento
    interval = 2
    if len(sys.argv) > 1:
        try:
            interval = float(sys.argv[1])
        except:
            print("Uso: python monitor_gpu_usage.py [intervalo_segundos]")
            sys.exit(1)
    
    monitor_gpu(interval=interval)
