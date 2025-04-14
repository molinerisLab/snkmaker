configfile: 'config.yaml'
rule all:
    input:
        expand('rmats-bam.txt'),
        expand('rMATS/MATS.JC.signif_ids.txt.tmp')

rule create_rmats_bam_txt:
    input:
        bam_file=config['bam_file']
    output:
        txt_file='rmats-bam.txt'
    log:
        'logs/create_rmats_bam_txt.log'
    shell:
        """echo {input.bam_file} | tr ' ' ',' > {output.txt_file}"""

rule filter_signif_mats_jc:
    input:
        mats_jc_file=config['mats_jc_file']
    output:
        signif_ids_file='rMATS/MATS.JC.signif_ids.txt.tmp'
    log:
        'logs/filter_signif_mats_jc.log'
    shell:
        """cat {input.mats_jc_file} | cut -f 1,13,14,15,16 | tr "," "\t" | bawk "$2 > {config['significance_threshold']} || $3 > {config['significance_threshold']} || $4 > {config['significance_threshold']} || $5 > {config['significance_threshold']} || $6 > {config['significance_threshold']} || $7 > {config['significance_threshold']} || $8 > {config['significance_threshold']} || $9 > {config['significance_threshold']} || $10 > {config['significance_threshold']} || $11 > {config['significance_threshold']} || $12 > {config['significance_threshold']} || $13 > {config['significance_threshold']}" | cut -f 1 > {output.signif_ids_file}"""
